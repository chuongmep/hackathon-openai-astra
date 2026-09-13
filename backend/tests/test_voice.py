import asyncio
import json
from types import SimpleNamespace

import httpx

from app.schemas import TaskContext, VoiceRequest
from app.voice import VoiceService, VoiceSession


class Socket:
    def __init__(self):
        self.sent = []
        self.closed = False

    async def send(self, message):
        self.sent.append(json.loads(message))

    async def close(self):
        self.closed = True


class VoiceAgent:
    def __init__(self, gate=None):
        self.requests = []
        self.gate = gate
        self.started = asyncio.Event()

    def check_context(self, context):
        pass

    def require_config(self):
        pass

    async def run(self, request):
        self.requests.append(request)
        self.started.set()
        if self.gate:
            await self.gate.wait()
        yield "text_delta", {"text": "There are 3 doors."}
        yield "done", {"status": "complete"}


def state():
    return VoiceSession("live_test", TaskContext(model_id="model", model_revision="rev"), Socket())


async def test_delegation_uses_transcripts_and_preserves_id():
    agent = VoiceAgent()
    service = VoiceService(None, agent)
    session = state()
    service.sessions[session.id] = session
    await service.handle(session, {"type": "session.input_transcript.delta", "delta": "How many "})
    await service.handle(session, {"type": "session.input_transcript.delta", "delta": "doors?"})
    event = {"type": "session.delegation.created", "delegation": {"id": "item_opaque", "target": "client"}}
    await service.handle(session, event)
    task = session.tasks["item_opaque"]
    await task
    await service.handle(session, event)
    assert len(agent.requests) == 1
    assert agent.requests[0].history[0].content == "How many doors?"
    assert session.socket.sent[-1]["delegation_id"] == "item_opaque"
    assert session.socket.sent[-1]["type"] == "session.commentary.append"
    await service.shutdown()
    assert session.socket.closed


async def test_context_update_discards_pending_results():
    gate = asyncio.Event()
    agent = VoiceAgent(gate)
    service = VoiceService(None, agent)
    session = state()
    service.sessions[session.id] = session
    session.transcripts.append({"role": "user", "content": "Count doors"})
    await service.handle(session, {"type": "session.delegation.created", "delegation": {"id": "item_old", "target": "client"}})
    await agent.started.wait()
    await service.update(session.id, TaskContext(model_id="other", model_revision="new"))
    gate.set()
    assert not any(e[1] == "text_delta" for e in session.events)
    assert not any(e.get("delegation_id") == "item_old" for e in session.socket.sent)
    assert session.transcripts == []
    await service.shutdown()


async def test_close_cancels_tasks_and_releases_connection():
    agent = VoiceAgent(asyncio.Event())
    service = VoiceService(None, agent)
    session = state()
    service.sessions[session.id] = session
    session.transcripts.append({"role": "user", "content": "Count"})
    await service.handle(session, {"type": "session.delegation.created", "delegation": {"id": "item_pending", "target": "client"}})
    await agent.started.wait()
    task = session.tasks["item_pending"]
    await service.close(session.id)
    assert task.cancelled()
    assert session.socket.closed and session.closed
    assert session.id not in service.sessions
    await service.shutdown()


async def test_live_http_negotiation_and_authenticated_attachment():
    requests = []

    def transport(request):
        requests.append(request)
        return httpx.Response(200, json={"session": {"id": "live_mock"},
                                        "transport": {"type": "webrtc", "sdp": "v=0 answer"}})

    class AttachedSocket(Socket):
        def __aiter__(self):
            return self

        async def __anext__(self):
            await asyncio.Event().wait()
            raise StopAsyncIteration

    socket = AttachedSocket()

    async def attach(url, **kwargs):
        assert url == "wss://api.openai.com/v1/live/sessions/live_mock/attach"
        assert kwargs["additional_headers"]["Authorization"] == "Bearer test-only"
        return socket

    http = httpx.AsyncClient(transport=httpx.MockTransport(transport))
    service = VoiceService(SimpleNamespace(api_key="test-only", voice_model="gpt-live-1"),
                           VoiceAgent(), http=http, connector=attach)
    try:
        result = await service.create(VoiceRequest(model_id="model", model_revision="rev", sdp="v=0 offer"))
        assert result["transport"]["sdp"] == "v=0 answer"
        assert str(requests[0].url) == "https://api.openai.com/v1/live/sessions"
        body = json.loads(requests[0].content)
        assert body["session"]["delegation"] == {"type": "client"}
        assert body["transport"]["sdp"] == "v=0 offer"
    finally:
        await service.shutdown()
    assert socket.closed
    assert socket.sent[-1]["type"] == "session.close"


async def test_connection_failures_are_actionable_and_do_not_register_sessions():
    import pytest

    from app.config import AppError

    for failure, code, status in [
        (httpx.RemoteProtocolError("sensitive upstream detail"), "voice_connection", 502),
        (httpx.ReadTimeout("sensitive upstream detail"), "voice_timeout", 504),
        (httpx.Response(403, text="sensitive upstream detail"), "voice_access", 502),
        (httpx.Response(429), "voice_rate_limit", 503),
    ]:
        def respond(request, failure=failure):
            if isinstance(failure, Exception):
                raise failure
            return failure

        service = VoiceService(SimpleNamespace(api_key="test-only", voice_model="gpt-live-1"),
                               VoiceAgent(), http=httpx.AsyncClient(transport=httpx.MockTransport(respond)))
        try:
            with pytest.raises(AppError) as caught:
                await service.create(VoiceRequest(model_id="model", model_revision="rev", sdp="v=0 offer"))
            assert caught.value.code == code
            assert caught.value.status == status
            assert "sensitive" not in caught.value.message
            assert not service.sessions
        finally:
            await service.shutdown()


async def test_attachment_timeout_identifies_control_stage():
    import pytest

    from app.config import AppError

    async def attach(*args, **kwargs):
        raise TimeoutError()

    service = VoiceService(SimpleNamespace(api_key="test-only", voice_model="gpt-live-1"), VoiceAgent(),
                           http=httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(201, json={
                               "session": {"id": "live_mock"}, "transport": {"sdp": "answer"}}))), connector=attach)
    try:
        with pytest.raises(AppError) as caught:
            await service.create(VoiceRequest(model_id="model", model_revision="rev", sdp="offer"))
        assert caught.value.code == "voice_timeout"
        assert "backend control connection" in caught.value.message
        assert not service.sessions
    finally:
        await service.shutdown()
