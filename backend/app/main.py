import asyncio
import json
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import FastAPI, File, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

from .agent import Agent
from .config import AppError, Settings
from .ifc_service import IfcService
from .schemas import ChatRequest, TaskContext, ValidationRequest, VoiceRequest
from .storage import Storage
from .validation import ValidationService
from .voice import VoiceService
from .workbooks import WorkbookService


def sse(event, data, sequence=None):
    prefix = f"id: {sequence}\n" if sequence is not None else ""
    return prefix + f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


class BodyLimit:
    def __init__(self, app, limit):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        length = 0

        async def limited():
            nonlocal length
            message = await receive()
            length += len(message.get("body", b""))
            if length > self.limit:
                from starlette.exceptions import HTTPException
                raise HTTPException(413, "Request exceeds 100 MB upload limit")
            return message

        await self.app(scope, limited, send)


def create_app(settings=None, agent_client=None):
    settings = settings or Settings()
    storage = Storage(settings.data_dir)
    ifc = IfcService(storage)
    workbooks = WorkbookService(storage)
    validation = ValidationService(storage, ifc, workbooks)
    agent = Agent(settings, ifc, validation, agent_client)
    voice = VoiceService(settings, agent)

    @asynccontextmanager
    async def lifespan(app):
        yield
        await voice.shutdown()
        if agent.client is not None:
            await agent.client.close()

    app = FastAPI(title="Astra-IFC-Complience", version="0.1.0", lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(BodyLimit, limit=settings.max_upload_bytes + 1024 * 1024)
    app.state.storage, app.state.ifc, app.state.agent, app.state.voice = storage, ifc, agent, voice

    @app.exception_handler(AppError)
    async def app_error(request, exc):
        return JSONResponse({"error": {"code": exc.code, "message": exc.message}}, status_code=exc.status)

    async def read_upload(file):
        try:
            data = bytearray()
            while chunk := await file.read(1024 * 1024):
                data.extend(chunk)
                if len(data) > settings.max_upload_bytes:
                    raise AppError(413, "upload_too_large", "File exceeds the 100 MB upload limit")
            if not data:
                raise AppError(422, "empty_upload", "Uploaded file is empty")
            return bytes(data)
        finally:
            await file.close()

    @app.get("/api/v1/health")
    def health():
        with storage.connect() as db:
            db.execute("SELECT 1")
        return {"status": "ok", "chat_configured": bool(settings.api_key), "voice_configured": bool(settings.api_key)}

    @app.post("/api/v1/models", status_code=201)
    async def upload_model(file: Annotated[UploadFile, File()]):
        content = await read_upload(file)
        return await asyncio.to_thread(ifc.upload, file.filename or "model.ifc", content)

    @app.get("/api/v1/models")
    def list_models():
        return [ifc.public(r) for r in storage.list("model")]

    @app.get("/api/v1/models/{model_id}")
    def model_info(model_id: str):
        return ifc.public(storage.get("model", model_id))

    @app.get("/api/v1/models/{model_id}/file")
    def model_file(model_id: str):
        record = storage.get("model", model_id)
        return FileResponse(storage.file(record), media_type="application/octet-stream", filename=record["filename"])

    @app.get("/api/v1/models/{model_id}/entities")
    def entities(model_id: str, ifc_class: str = "IfcElement", search: str | None = None,
                 storey_guid: str | None = None, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                 property_set: str | None = None, property_name: str | None = None, property_value: str | None = None):
        return ifc.query(model_id, ifc_class, search, storey_guid, offset, limit,
                         property_set=property_set, property_name=property_name, property_value=property_value)

    @app.get("/api/v1/models/{model_id}/entities/{guid}")
    def entity_details(model_id: str, guid: str):
        record = storage.get("model", model_id)
        return {"model_id": model_id, "model_revision": record["revision"], **ifc.details(model_id, guid)}

    @app.post("/api/v1/workbooks", status_code=201)
    async def upload_workbook(file: Annotated[UploadFile, File()]):
        content = await read_upload(file)
        return await asyncio.to_thread(workbooks.upload, file.filename or "schedule.xlsx", content)

    @app.post("/api/v1/validations", status_code=201)
    def validate(body: ValidationRequest):
        return validation.run(body)

    @app.get("/api/v1/validations/{report_id}")
    def report(report_id: str, format: Literal["json", "csv"] = "json"):
        report = storage.get("validation", report_id)
        if format == "csv":
            return Response(validation.csv(report), media_type="text/csv",
                            headers={"Content-Disposition": f'attachment; filename="validation-{report_id}.csv"'})
        return report

    @app.post("/api/v1/chat")
    async def chat(body: ChatRequest):
        agent.require_config()
        await asyncio.to_thread(agent.check_context, body)

        async def events():
            async for event, data in agent.run(body):
                yield sse(event, data)
        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.post("/api/v1/voice/sessions", status_code=201)
    async def start_voice(body: VoiceRequest):
        return await voice.create(body)

    @app.patch("/api/v1/voice/sessions/{session_id}")
    async def update_voice(session_id: str, body: TaskContext):
        return await voice.update(session_id, body)

    @app.delete("/api/v1/voice/sessions/{session_id}", status_code=204)
    async def stop_voice(session_id: str):
        await voice.close(session_id)

    @app.get("/api/v1/voice/sessions/{session_id}/events")
    async def voice_events(session_id: str, request: Request):
        state = voice.get(session_id)
        try:
            cursor = int(request.headers.get("last-event-id", "0"))
        except ValueError:
            raise AppError(422, "invalid_cursor", "Last-Event-ID must be an integer")

        async def events():
            nonlocal cursor
            while True:
                for sequence, event, data in list(state.events):
                    if sequence > cursor:
                        yield sse(event, data, sequence)
                        cursor = sequence
                if state.closed or await request.is_disconnected():
                    return
                yield ": heartbeat\n\n"
                await asyncio.sleep(1)
        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return app


app = create_app()
