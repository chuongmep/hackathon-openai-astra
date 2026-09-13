import json
from types import SimpleNamespace

import pytest
from app.agent import Agent
from app.config import AppError, Settings
from app.schemas import ChatRequest


class Output:
    def __init__(self, **data):
        self.data = data

    def model_dump(self, **kwargs):
        return self.data


class Stream:
    def __init__(self, events):
        self.events = events
        self.closed = False

    def __aiter__(self):
        return self.iterate()

    async def iterate(self):
        for event in self.events:
            yield event

    async def close(self):
        self.closed = True


class FakeClient:
    def __init__(self, streams):
        self.responses = self
        self.streams = streams
        self.requests = []

    async def create(self, **kwargs):
        self.requests.append(kwargs)
        return self.streams[len(self.requests) - 1]

    async def close(self):
        pass


@pytest.mark.asyncio
async def test_agent_executes_real_query_and_returns_tool_evidence(app, client, loaded):
    model, guids = loaded
    call = Output(type="function_call", name="query_entities", call_id="call-1", arguments=json.dumps({"ifc_class": "IfcDoor"}))
    streams = [Stream([SimpleNamespace(type="response.completed", response=SimpleNamespace(output=[call]))]),
               Stream([SimpleNamespace(type="response.output_text.delta", delta="There are 3 doors."),
                       SimpleNamespace(type="response.completed", response=SimpleNamespace(output=[]))])]
    transport = FakeClient(streams)
    agent = Agent(Settings(api_key="test"), app.state.ifc, app.state.agent.validation, transport)
    context = ChatRequest(model_id=model["id"], model_revision=model["revision"], message="How many doors?")
    events = [event async for event in agent.run(context)]
    result = next(data for name, data in events if name == "result")
    assert result["data"]["total"] == 3
    assert {r["GlobalId"] for r in result["data"]["items"]} == set(guids)
    tool_output = transport.requests[1]["input"][-1]
    assert json.loads(tool_output["output"])["total"] == 3
    assert all(stream.closed for stream in streams)
    assert events[-1] == ("done", {"status": "complete"})


@pytest.mark.asyncio
async def test_incomplete_stream_is_error(app, client, loaded):
    model, _ = loaded
    stream = Stream([])
    agent = Agent(Settings(api_key="test"), app.state.ifc, app.state.agent.validation, FakeClient([stream]))
    request = ChatRequest(model_id=model["id"], model_revision=model["revision"], message="Count")
    events = [event async for event in agent.run(request)]
    assert events[-2][0] == "error"
    assert events[-1] == ("done", {"status": "error"})
    assert stream.closed


def test_tool_selection_scope_and_no_arbitrary_execution(app, client, loaded):
    model, guids = loaded
    context = ChatRequest(model_id=model["id"], model_revision=model["revision"], selected_guids=[guids[0]], message="Count")
    agent = app.state.agent
    result, _ = agent.execute("query_entities", '{"ifc_class":"IfcDoor","scope":"selection"}', context)
    assert result["total"] == 1
    assert agent.execute("query_entities", '{"ifc_class":"IfcDoor"}', context)[0]["total"] == 3
    with pytest.raises(AppError, match="not available"):
        agent.execute("execute_python", '{"code":"print(1)"}', context)
    with pytest.raises(AppError, match="not found"):
        agent.execute("viewer_action", '{"action":"isolate","guids":["missing"]}', context)
    result, action = agent.execute("viewer_action", json.dumps({"action": "frame", "guids": [guids[0]]}), context)
    assert result["status"] == "requested"
    assert action["model_revision"] == model["revision"]


@pytest.mark.asyncio
async def test_general_workbook_tools_without_schedule_mappings(app, client, loaded):
    import io

    import openpyxl

    model, _ = loaded
    book = openpyxl.Workbook()
    book.active.title = "Classification"
    book.active.append(["Code", "Description"])
    book.active.append(["A10", "Foundations"])
    book.active.append(["B20", "Exterior enclosure"])
    output = io.BytesIO()
    book.save(output)
    uploaded = client.post("/api/v1/workbooks", files={"file": ("standard.xlsx", output.getvalue())}).json()
    request = ChatRequest(model_id=model["id"], model_revision=model["revision"],
                          workbook_id=uploaded["id"], message="Understand the Excel file")
    agent = app.state.agent
    agent.check_context(request)
    summary, _ = agent.execute("get_workbook_summary", "{}", request)
    assert summary["filename"] == "standard.xlsx"
    assert summary["sheets"][0]["name"] == "Classification"
    page, _ = agent.execute("read_workbook_rows", '{"sheet":"Classification","limit":2}', request)
    assert page["next_offset"] == 2
    assert page["rows"][1]["cells"][1] == {"cell": "B2", "value": "Foundations", "truncated": False}
    result, _ = agent.execute("read_workbook_rows", '{"sheet":"Classification","search":"enclosure"}', request)
    assert result["rows"][0]["row"] == 3
    with pytest.raises(AppError, match="select its columns"):
        agent.execute("validate_materials", "{}", request)
    call = Output(type="function_call", name="read_workbook_rows", call_id="excel-1", arguments='{"sheet":"Classification"}')
    transport = FakeClient([Stream([SimpleNamespace(type="response.completed", response=SimpleNamespace(output=[call]))]),
                            Stream([SimpleNamespace(type="response.output_text.delta", delta="Classification!B2 lists Foundations."),
                                    SimpleNamespace(type="response.completed", response=SimpleNamespace(output=[]))])])
    runner = Agent(Settings(api_key="test"), app.state.ifc, agent.validation, transport)
    events = [event async for event in runner.run(request)]
    assert any(name == "result" and data["tool"] == "read_workbook_rows" for name, data in events)
    assert uploaded["id"] in transport.requests[0]["instructions"]
    assert events[-1] == ("done", {"status": "complete"})
