import json
import os
from types import SimpleNamespace

import pytest
from app.agent import Agent
from app.config import Settings
from app.schemas import VoiceRequest
from app.voice import VoiceService
from openai import AsyncOpenAI

pytestmark = [pytest.mark.live, pytest.mark.skipif(os.getenv("RUN_LIVE_TESTS") != "1" or not os.getenv("OPENAI_API_KEY"),
                                                  reason="Set RUN_LIVE_TESTS=1 and OPENAI_API_KEY for live API checks")]


async def test_astra_tool_call():
    async with AsyncOpenAI() as client:
        result = await client.responses.create(model=os.getenv("ASTRA_MODEL", "gpt-6-astra"),
            input="Call get_model_summary to inspect the active model.",
            tools=[{"type": "function", "name": "get_model_summary", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}],
            tool_choice="required", max_output_tokens=1000, store=False)
        assert any(item.type == "function_call" and item.name == "get_model_summary" for item in result.output)


async def test_astra_fixture_workflows(app, client, loaded):
    """Real model calls using only generated IFC/workbook fixtures, never project files."""
    from app.schemas import ChatRequest
    from conftest import workbook_bytes

    model, guids = loaded
    book = client.post('/api/v1/workbooks', files={'file': ('synthetic.xlsx', workbook_bytes([
        (guids[0], 'steel'), (guids[1], 'steel'), (guids[2], 'steel')]))}).json()
    async with AsyncOpenAI() as transport:
        agent = Agent(Settings(), app.state.ifc, app.state.agent.validation, transport)
        base = {'model_id': model['id'], 'model_revision': model['model_revision']}
        requests = [
            (ChatRequest(**base, message='How many doors are in this model? Highlight all of them.'), 'query_entities'),
            (ChatRequest(**base, selected_guids=[guids[1]], message='What is the material of the selected door?'), 'get_entity_details'),
            (ChatRequest(**base, schedule={'workbook_id': book['id'], 'sheet': 'Door Schedule'},
                         message='Check the schedule materials and isolate the doors that fail.'), 'validate_materials'),
        ]
        for request, required_tool in requests:
            events = [event async for event in agent.run(request)]
            errors = [data for kind, data in events if kind == 'error']
            assert not errors, errors
            assert events[-1] == ('done', {'status': 'complete'})
            results = [data for kind, data in events if kind == 'result' and data['tool'] == required_tool]
            assert results, [kind for kind, _ in events]
            if required_tool == 'query_entities':
                assert results[0]['data']['total'] == 3
                assert any(kind == 'viewer_action' and set(data['guids']) == set(guids) for kind, data in events)
            elif required_tool == 'get_entity_details':
                assert results[0]['data']['materials']['names'] == ['Timber']
            else:
                assert results[0]['data']['counts'] == {'pass': 1, 'fail': 1, 'unknown': 1}
                assert any(kind == 'viewer_action' and data['action'] == 'isolate' and data['guids'] == [guids[1]] for kind, data in events)
            print(json.dumps({'workflow': required_tool, 'answer': ''.join(data['text'] for kind, data in events if kind == 'text_delta')}))


async def test_live_session_from_browser_sdp():
    path = os.getenv("LIVE_SDP_FILE")
    import asyncio
    from pathlib import Path
    peer = None
    if path:
        sdp = Path(path).read_text()
    else:
        rtc = pytest.importorskip('aiortc', reason='Use uv run --with aiortc for a generated silent WebRTC offer')
        peer = rtc.RTCPeerConnection()
        peer.addTransceiver('audio', direction='sendrecv')
        peer.createDataChannel('oai-events')
        await peer.setLocalDescription(await peer.createOffer())
        sdp = peer.localDescription.sdp
    agent = SimpleNamespace(require_config=lambda: None, check_context=lambda context: None)
    service = VoiceService(Settings(), agent)
    try:
        result = await service.create(VoiceRequest(model_id="synthetic-smoke", model_revision="synthetic", sdp=sdp))
        assert result["session"]["id"]
        assert "v=0" in result["transport"]["sdp"]
        if peer:
            await peer.setRemoteDescription(rtc.RTCSessionDescription(sdp=result['transport']['sdp'], type='answer'))
            async with asyncio.timeout(20):
                while peer.connectionState not in ('connected', 'failed', 'closed'):
                    await asyncio.sleep(.2)
            assert peer.connectionState == 'connected'
    finally:
        await service.shutdown()
        if peer:
            await peer.close()
        assert not service.sessions
