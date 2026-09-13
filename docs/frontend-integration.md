# Frontend integration contract

Base path: `/api/v1`. Development backend: `http://127.0.0.1:8000`; use a frontend reverse proxy, as the mock does. Docker serves everything at `http://localhost:3000`. No credentials belong in the frontend bundle. OpenAPI is at `/api/openapi.json`; Swagger UI is at `/api/docs`.

## Model identity and selection

Upload with multipart field `file` to `POST /models`. The response includes:

```json
{
  "id": "opaque-model-id",
  "model_id": "opaque-model-id",
  "model_revision": "sha256-of-original-bytes",
  "revision": "sha256-of-original-bytes",
  "filename": "sample.ifc",
  "summary": {"schema": "IFC2X3", "element_count": 100, "counts": {"IfcDoor": 16}, "length_unit_to_metre": 0.001, "storeys": []}
}
```

Numbers above are illustrative except the supplied sample's door count. `id`/`revision` are storage fields; `model_id`/`model_revision` are the canonical context names. Serve the exact uploaded bytes from `GET /models/{id}/file` to your viewer. `GET /models` and `GET /models/{id}` restore previous uploads after a page reload.

An IFC `GlobalId` is a string. An Express ID is a file-local integer. Neither is the viewer's federation ID. All cross-component actions carry the model ID, revision, and GUID strings. The mock uses `selectByGuid`, then its returned numeric IDs for `isolate`, `setColors`, and `fitToView`.

`GET /models/{id}/entities?ifc_class=IfcDoor&offset=0&limit=100` returns `{model_id, model_revision, total, offset, limit, items}`. Each item has `GlobalId`, `express_id`, `ifc_class`, `Name`, and `storey`. `total` is the full result count; `items` is one page. Limits are 1–500; offsets start at zero. Optional filters: `search` (case-insensitive name substring), `storey_guid`, and `property_set` + `property_name` + `property_value` (string comparison of effective property value).

`GET /models/{id}/entities/{guid}` returns identity plus raw attributes, effective `properties_and_quantities`, separate occurrence/type values, per-property provenance, and effective material names with assignment provenance. Values preserve original units; the summary supplies the model length conversion factor. Missing data is represented as null/empty data, not a guess.

## Workbook and validation

`POST /workbooks` accepts multipart `file` and returns an `id` plus sheet names, dimensions, and ten-row previews. Offer the user a worksheet, header row, GUID column, and expected-material column.

```json
{
  "model_id": "opaque-model-id",
  "model_revision": "sha256-of-original-bytes",
  "schedule": {
    "workbook_id": "opaque-workbook-id",
    "sheet": "Door Schedule",
    "header_row": 1,
    "guid_column": "GlobalId",
    "material_column": "ExpectedMaterial"
  }
}
```

Send that body to `POST /validations`. The response includes `id`, context, `counts`, `findings`, and `uncovered_door_guids`. Counts omit statuses with zero rows. Each finding contains `GlobalId`, `status`, `reason`, `actual` (list of names), `expected` (string), material provenance, and `source: {workbook_id, sheet, row}`. Row numbers are Excel's one-based row numbers.

- GUID matching is exact within the active immutable model revision.
- Material matching ignores case and collapses whitespace. Any matching effective assigned material passes. This checks material-name presence, not layer thickness or an entire assembly specification.
- Missing/duplicate keys, missing materials/expectations, formula expectations, and unresolved entities are `unknown`.
- An unmatched material is `fail`. A door absent from the schedule is uncovered and reported separately.
- Formula cells are not evaluated. Schedules are capped at 100,000 rows / 200 columns. Uploads are capped at 100 MB, with a 200 MB expanded workbook limit.

Retrieve reports at `GET /validations/{id}`. Add `?format=csv` for an attachment; default JSON preserves the full result. Use a row click to select and frame its resolved entity. Unresolved GUID findings have no geometry to select.

## Text chat and streaming

`POST /chat` takes:

```json
{
  "model_id": "opaque-model-id",
  "model_revision": "sha256-of-original-bytes",
  "selected_guids": [],
  "schedule": null,
  "history": [],
  "message": "How many doors are in this house? Show them."
}
```

Supply `schedule` as above for spreadsheet checks. History is a list of `{role: "user" | "assistant", content: string}`; maximum 50 messages, 12,000 characters each. The frontend owns text conversation history. A selected-object question needs `selected_guids`; ordinary questions apply to the entire active model.

Use `fetch()` and a streaming reader, not `EventSource`, because this is a POST. The response is SSE:

```text
event: progress
data: {"tool":"query_entities"}

event: result
data: {"tool":"query_entities","data":{"total":16,"offset":0,"limit":100,"items":[]}}

event: viewer_action
data: {"model_id":"opaque-model-id","model_revision":"sha256-of-original-bytes","action":"highlight","guids":["actual-ifc-guid"],"color":[1,0.25,0.15,1]}

event: text_delta
data: {"text":"There are 16 doors."}

event: done
data: {"status":"complete"}
```

The empty `items` array above abbreviates the example; real query results include the requested page. Supported actions: `select`, `highlight`, `isolate`, `frame`, `reset`. Reject actions for a different model/revision. Serialize viewer operations so isolation completes before framing. Treat an action as a request until your viewer confirms it.

Validation tool results include the first 100 findings and a `report_url`; fetch the full report for the table. Provider input is bounded, and count tools always return full totals. The agent is limited to eight tool rounds / 240 seconds. A post-stream failure emits `error` followed by `done` with `status: "error"`. Do not save partial error responses as successful answers. Abort the fetch when changing model or unmounting.

## Voice

1. Request microphone access on a user gesture, create `RTCPeerConnection`, attach audio tracks, and create the `oai-events` data channel.
2. Create/set a local offer and wait for ICE gathering. Send the same context as chat, without `message`, plus `sdp` to `POST /voice/sessions`.
3. Apply `result.transport.sdp` as the remote answer; retain `result.session.id` unchanged. Play the remote audio track. Do not send a second `session.start`.
4. Subscribe to `GET /voice/sessions/{id}/events` with `EventSource`. Events include the chat events above plus `transcript: {role,text}`, and `closed`. Backend task events carry `delegation_id`.
5. `PATCH /voice/sessions/{id}` with a complete updated context when selection or schedule changes. This invalidates pending backend work. Close/recreate the session when switching models in the mock.
6. `DELETE /voice/sessions/{id}` on stop/unmount. Also close EventSource, the peer connection, audio playback, and every microphone track. Deletion is idempotent.

The server receives GPT-Live transcript fragments and `session.delegation.created`, constructs the task from transcript history, and invokes the same Astra runner. It returns a concise result using `session.commentary.append` with the original delegation ID. The browser does not execute AI tools or forward untrusted tool-result payloads.

An SSE reconnect replays up to the last 500 buffered voice events using `Last-Event-ID`. Sessions expire after ten minutes, are in memory, and cannot resume after a backend restart. Start a new session after connection failure. Live audio and backend task completion are independent; `done` does not mean playback finished.

## Errors and ownership

Domain errors use `{error: {code, message}}` with an appropriate HTTP status. FastAPI request-schema errors use its standard `422 detail` array. Handle both shapes.

Common codes: `not_found`/`entity_not_found` (404), `revision_mismatch` (409), `upload_too_large` (413), invalid workbook/IFC/schedule (422), `voice_limit` (429), `openai_not_configured` (503), and `voice_unavailable` (502). Unknown model/material evidence is a validation finding, not a transport failure.

Backend owns parsing, data truth, validation, model identity, reports, AI execution, and voice delegation. Frontend owns rendering, interaction, conversation history, selection context, microphone controls, and presentation. Replace the mock without importing Python internals or depending on Zustand store details.
