import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from urllib.parse import quote

import httpx
from websockets.asyncio.client import connect

from .config import AppError
from .schemas import ChatRequest, TaskContext

logger = logging.getLogger(__name__)


@dataclass
class VoiceSession:
    id: str
    context: TaskContext
    socket: object
    generation: int = 0
    closed: bool = False
    transcripts: list = field(default_factory=list)
    events: list = field(default_factory=list)
    tasks: dict = field(default_factory=dict)
    seen: set = field(default_factory=set)
    reader: asyncio.Task | None = None
    expiry: asyncio.Task | None = None
    sequence: int = 0

    def emit(self, event, data):
        self.sequence += 1
        self.events.append((self.sequence, event, data))
        self.events = self.events[-500:]


class VoiceService:
    """GPT-Live client delegation; the browser never supplies tool results."""
    def __init__(self, settings, agent, http=None, connector=connect):
        self.settings, self.agent = settings, agent
        # Retry only connection establishment (before the POST is sent). Retrying
        # an ambiguous read failure could create a second upstream session.
        self.http = http or httpx.AsyncClient(
            timeout=httpx.Timeout(20, connect=5),
            transport=httpx.AsyncHTTPTransport(retries=1, limits=httpx.Limits(max_keepalive_connections=0)),
        )
        self.connector = connector
        self.sessions = {}

    async def create(self, request):
        self.agent.require_config()
        await asyncio.to_thread(self.agent.check_context, request)
        if len(self.sessions) >= 4:
            raise AppError(429, "voice_limit", "Close an existing voice session first")
        headers = {"Authorization": f"Bearer {self.settings.api_key}"}
        started = time.monotonic()
        stage = "session creation"
        try:
            async with asyncio.timeout(28):
                response = await self.http.post("https://api.openai.com/v1/live/sessions", headers=headers, json={
                    "session": {"model": self.settings.voice_model, "delegation": {"type": "client"},
                                "instructions": "You are the voice interface for Astra IFC Compliance. Delegate all model questions, counts, materials, validation and viewer requests to the backend. Speak only verified backend findings. Do not invent results. Be concise. Ask for clarification when context is missing."},
                    "transport": {"type": "webrtc", "sdp": request.sdp},
                })
                response.raise_for_status()
                result = response.json()
                session_id = result["session"]["id"]
                stage = "backend control connection"
                socket = await self.connector(
                    f"wss://api.openai.com/v1/live/sessions/{quote(session_id, safe='')}/attach",
                    additional_headers=headers, open_timeout=8, max_size=2**20,
                )
        except Exception as exc:
            # Never log request bodies, SDP, authorization headers or upstream error text.
            status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
            logger.warning("Live %s failed after %.1fs (%s, status=%s)",
                           stage, time.monotonic() - started, type(exc).__name__, status)
            if isinstance(exc, (TimeoutError, httpx.TimeoutException)):
                raise AppError(504, "voice_timeout", f"GPT-Live {stage} timed out. Please retry.") from exc
            if isinstance(exc, httpx.TransportError):
                raise AppError(502, "voice_connection", f"Connection to OpenAI failed during {stage}. Please retry; if it persists, check the backend internet connection.") from exc
            if status in (401, 403, 404):
                raise AppError(502, "voice_access", "OpenAI rejected GPT-Live access. Check the backend API key and gpt-live-1 model access.") from exc
            if status == 429:
                raise AppError(503, "voice_rate_limit", "OpenAI voice capacity or quota is unavailable. Please retry shortly or check API usage limits.") from exc
            raise AppError(502, "voice_unavailable", f"GPT-Live {stage} failed. Please retry; backend logs contain the failure stage.") from exc
        logger.info("Live session and control connection ready in %.1fs", time.monotonic() - started)
        context = TaskContext.model_validate(request.model_dump(exclude={"sdp"}))
        state = VoiceSession(session_id, context, socket)
        self.sessions[session_id] = state
        state.reader = asyncio.create_task(self.read(state))
        state.expiry = asyncio.create_task(self.expire(state))
        return {"session": {"id": session_id}, "transport": result["transport"]}

    def get(self, session_id):
        if session_id not in self.sessions:
            raise AppError(404, "voice_not_found", "Voice session not found or closed")
        return self.sessions[session_id]

    async def expire(self, state):
        await asyncio.sleep(600)
        await self.close(state.id)

    async def update(self, session_id, context):
        await asyncio.to_thread(self.agent.check_context, context)
        state = self.get(session_id)
        # Every context update invalidates in-flight requests, even selection changes.
        state.generation += 1
        pending = list(state.tasks.values())
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        state.tasks.clear()
        model_changed = (state.context.model_id, state.context.model_revision) != (context.model_id, context.model_revision)
        state.context = context
        if model_changed:
            state.transcripts.clear()
        await state.socket.send(json.dumps({"type": "session.instructions.append", "event_id": uuid.uuid4().hex,
                                           "delegation_id": None,
                                           "content": "Application context changed. Disregard pending results from previous selections or models; delegate new requests using current context."}))
        return {"status": "updated", "generation": state.generation}

    async def read(self, state):
        try:
            async for raw in state.socket:
                await self.handle(state, json.loads(raw))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 -- reader must close the session after transport failures
            logger.warning("Live connection stopped (%s)", type(exc).__name__)
            state.emit("error", {"message": "Voice connection interrupted; start a new session"})
        finally:
            await self.close(state.id)

    async def handle(self, state, event):
        if state.closed:
            return
        kind = event.get("type", "")
        if kind in ("session.input_transcript.delta", "session.output_transcript.delta"):
            role = "user" if kind == "session.input_transcript.delta" else "assistant"
            state.transcripts.append({"role": role, "content": event.get("delta", ""),
                                      "start_ms": event.get("start_ms", 0), "end_ms": event.get("end_ms", 0)})
            state.emit("transcript", {"role": role, "text": event.get("delta", "")})
        elif kind == "session.delegation.created":
            delegation = event.get("delegation", {})
            key = delegation.get("id")
            if delegation.get("target") != "client" or not key or key in state.seen:
                return
            state.seen.add(key)
            state.tasks[key] = asyncio.create_task(self.delegate(state, key, state.generation))
        elif kind == "session.closed":
            await self.close(state.id)
        elif kind == "error":
            state.emit("error", {"message": "GPT-Live reported a session error"})

    async def delegate(self, state, key, generation):
        try:
            # Coalesce transcript fragments; never treat delegation metadata as task text.
            history = [m.model_dump() for m in state.context.history]
            for fragment in state.transcripts:
                if history and history[-1]["role"] == fragment["role"]:
                    history[-1]["content"] += fragment["content"]
                else:
                    history.append({"role": fragment["role"], "content": fragment["content"]})
            if not any(h["role"] == "user" and h["content"].strip() for h in history):
                await self.append(state, key, "I did not receive your question. Please repeat it.")
                return
            request = ChatRequest(**state.context.model_dump(exclude={"history"}),
                                  history=[{**h, "content": h["content"][-12000:]} for h in history[-48:]],
                                  message="Respond to the latest user request in the voice transcript using the active model context.")
            answer = ""
            failed = False
            async for event, data in self.agent.run(request):
                if state.closed or state.generation != generation:
                    return
                state.emit(event, {**data, "delegation_id": key})
                if event == "text_delta":
                    answer += data["text"]
                if event == "error":
                    failed = True
            if not state.closed and state.generation == generation:
                await self.append(state, key, "The model lookup failed. Please try again." if failed else answer or "No verified result was returned.")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 -- background tasks report failures to the session UI
            logger.warning("Voice delegation failed (%s)", type(exc).__name__)
            if not state.closed and generation == state.generation:
                state.emit("error", {"delegation_id": key, "message": "Voice task failed; please try again"})
        finally:
            state.tasks.pop(key, None)

    async def append(self, state, key, content):
        # Leave room within Live's 500-token append limit; full answer is in UI events.
        await state.socket.send(json.dumps({"type": "session.commentary.append", "event_id": uuid.uuid4().hex,
                                           "delegation_id": key, "content": content[:900]}))

    async def close(self, session_id):
        state = self.sessions.pop(session_id, None)
        if state is None or state.closed:
            return
        state.closed = True
        state.generation += 1
        state.emit("closed", {"session_id": session_id})
        current = asyncio.current_task()
        pending = [t for t in [state.reader, state.expiry, *state.tasks.values()] if t and t is not current]
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        try:
            await state.socket.send(json.dumps({"type": "session.close"}))
        except Exception as exc:  # noqa: BLE001 -- socket may already be closed; still release local resources
            logger.info("Live close command unavailable (%s)", type(exc).__name__)
        await state.socket.close()

    async def shutdown(self):
        for key in list(self.sessions):
            await self.close(key)
        await self.http.aclose()
