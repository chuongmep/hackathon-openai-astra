# Verification record

Checked locally on 2026-09-13 (macOS ARM64, Docker Desktop).

## Completed

- Backend: `backend/.venv/bin/pytest backend/tests -q` — **14 passed, 2 skipped**. Skipped tests require live OpenAI credentials. The suite exercises real IFC4 fixtures and the supplied IFC2X3 sample, inherited and occurrence properties/materials, quantities, storeys, filtering/pagination, upload limits, schedule evidence, duplicate/missing values, revision conflicts, persistence, CSV escaping, mocked Responses streams, voice HTTP/WebSocket setup, delegation correlation and cancellation.
- Ruff check of backend app, tests, and scripts — passed.
- Mock: `bun test` — **3 passed**; `bun run build` — TypeScript and Vite production build passed.
- Pinned ifc-lite: its 37 viewer dependency packages and embed SDK build with the existing pnpm/Turbo tooling; production embed build passes using matching WASM 7.0.0 artifacts.
- Supplied IFC: **16 door occurrences**. Original IFC bytes are preserved and served by the API.
- Demo workbook: **13 pass, 1 fail, 2 unknown, 1 uncovered door**. The mismatch is intentional; unknown cases are a blank expected material and an unresolved GUID.
- Browser against local development services: IFC upload and 3D rendering, workbook upload/mapping, material validation, failure isolation, finding-row selection/framing, property retrieval, selected-object chat context indicator, and missing-key chat error verified.
- Both Docker images build; `docker compose up -d --wait` reports both containers healthy. The workbench and embedded viewer initialize through Nginx at localhost:3000.
- Repeated the browser IFC upload/render, demo workbook validation, and failure isolation against the final Compose deployment; the viewer reports 460 hidden objects after isolating the failed door.
- `backend/.venv/bin/python backend/scripts/smoke_demo.py` passes against Compose: upload, exact-byte file retrieval, SHA-256 revision, 16-door query, workbook validation, and CSV export. The Docker viewer build removes copied TypeScript incremental metadata before compiling, preventing missing outputs on workspaces that were already built locally.

## Limits of this verification

- Initial checks had no API key. Follow-up live results are recorded below. Generated speech and returned audio were verified, but actual microphone capture, speaker playback, and interruption during a human conversation remain **unverified**.
- ifc-lite logged three CSG failures across two sample products while still rendering the scene. Geometry fidelity for every object/opening was not audited. Deterministic counts and materials come from IfcOpenShell, independently of viewer geometry.
- The temporary table renders backend JSON with ordinary React HTML; it is not a full spreadsheet editor. Workbook parsing/export belongs to the backend. The teammate can replace the mock through the documented API.
- This release has no authentication, multi-worker coordination, or persistent voice-session recovery. Compose publishes only to localhost.

## Live follow-up with backend/.env

- Loaded the user-provided key into the deployed backend using `docker compose --env-file backend/.env up -d --force-recreate backend`. No key value was printed or committed; nested `.env` files are excluded from Docker context as well as Git.
- The Models API accepts both exact requested IDs: `gpt-6-astra` and `gpt-live-1`.
- Real Astra function-call smoke passed. A live integration test using generated three-door IFC4 data passed all three workflows: count/highlight all three doors; identify Timber on the selected occurrence; validate synthetic material rows (one pass, one fail, one unknown), then isolate/frame the failed door. These use the application's actual deterministic tools and streamed Responses runner.
- Real GPT-Live transport smoke passed: session creation HTTP 201, authenticated backend WebSocket attachment, WebRTC connection state `connected`, then session closure and peer cleanup. The SDP offer was generated with aiortc; no microphone audio was captured. aiortc is an optional test runtime, not a backend deployment dependency.
- After explicit user approval of project-metadata transfer, the supplied IFC was tested with real Astra through the deployed `/chat` SSE endpoint. It returned a verified count of **16 doors**, a highlight action containing all 16 GUIDs, and successful completion.
- Browser chat using the supplied IFC and demo workbook returned **13 pass, 1 fail, 2 unknown, and 1 uncovered door**. The response identified failing GUID `0ELdlxJuP1AwzgUXpRT7eB`, source row 2, expected `DEMO INTENTIONAL MISMATCH`, and actual `Door - Frame` / `Door - Panel`. Real AI-generated isolate/frame actions executed in the embedded viewer (460 objects hidden). Report: `/api/v1/validations/bacb8de9d4bf4c8885b6b3475165d3c1` in the local persistent volume.
- Clicking that finding and asking about the selected door passed the actual GUID into chat. Astra fetched its details and correctly reported `Door - Frame` and `Door - Panel`, assigned at occurrence level through `IfcMaterialList`.
- A generated spoken request was streamed over WebRTC to GPT-Live with the real project/schedule context. GPT-Live transcribed the question, created a delegation, and the backend Astra runner called `validate_materials`, then isolate/frame with the original delegation ID. Results matched the text workflow. Returned speech included the pass/fail/unknown/uncovered counts; 1,377 audio frames were received, including 449 frames with audible-level samples. The test then deleted the session and closed the peer. No microphone audio was recorded; playback was received programmatically, not audited through speakers.

## Teammate frontend integration

- Created `codex/frontend-integration` from committed `feat/backend` and merged remote `main` at `812536f`. The source branches were preserved. The integration changes have not been pushed.
- Root Compose now serves the teammate's `frontend/` rather than the legacy embed mock. The original model tree, resizable panels, WebGPU viewer, properties, and ExcelJS export remain. Added backend uploads/original-byte retrieval, real SSE chat, GPT-Live client, schedule mappings/results/CSV, and model/revision-aware viewer actions.
- Frontend unit tests: **8 passed** (including inherited real-IFC/XLSX tests and new SSE, revision guard, GUID resolution, and mesh-origin framing tests). Typecheck and Docker production build passed. Backend regression suite: **14 passed, 3 live tests deselected**. Deployed API smoke script passed through the new Nginx proxy.
- Browser loaded all 496 backend IFC occurrences in the teammate's UI. Real Astra counted 16 doors and returned highlight actions; real chat validation returned 13 pass, 1 fail, 2 unknown, and 1 uncovered, with the correct GUID and source row.
- The visual test caught a camera-framing error caused by local mesh coordinates. Framing now adds each mesh's origin to match the renderer's world coordinates; a regression test covers the offset calculation.
- Final visual check confirmed the isolated failed door is visible and framed correctly. Clicking its finding and asking real Astra about the selection returned `Door - Frame` and `Door - Panel` with occurrence-level `IfcMaterialList` provenance. Worksheet mappings and results survived collapsing/reopening the sheet.
- The integrated voice UI uses the previously tested GPT-Live backend contract. Human microphone/speaker behavior in this frontend remains a manual check.

## Voice startup reliability follow-up (2026-09-13)

- Reproduced the reported generic failure: backend logs showed `RemoteProtocolError`. A deployed test also reproduced a TLS `ConnectTimeout`, while direct host GPT-Live negotiation succeeded. Subsequent Docker TLS probes to both resolved OpenAI addresses succeeded. This indicates intermittent outbound connectivity; the precise network cause was not established.
- Voice startup now uses a 28-second upstream deadline, bounded connection/attachment timeouts, fresh HTTP connections, and one retry only for connection establishment. Ambiguous POST read failures are not automatically replayed. Errors distinguish transport, timeout, access, quota, and attachment stages without logging credentials or SDP.
- The frontend displays microphone/network/OpenAI/audio startup stages, allows cancellation, waits for an actual connected media transport, releases microphone tracks, and closes sessions that arrive after cancellation. Cleanup failures cannot mask the initial error. The browser implementation retains full ICE gathering as required by the current GPT-Live WebRTC example.
- Regression checks: 16 backend tests passed (3 live tests deselected), 12 frontend tests passed, TypeScript and Ruff passed, Compose production build and readiness passed. Added failure classification, attachment timeout, media readiness, cancellation, late microphone/session cleanup, and original-error preservation coverage.
- Final deployed generated-speech test: session creation plus backend attachment returned HTTP 201 in **2.95 seconds**. GPT-Live transcribed the request, Astra validated the supplied demo schedule (13 pass, 1 fail, 2 unknown), and returned isolate/frame actions for the failing door with the same delegation ID. Received 1,598 audio frames, 455 above the audible-sample threshold, then closed the session and peer. An earlier run overlapped a deployment restart and timed out; the final run was performed after deployment completed.
- The actual in-app browser also reached “Voice connected — you can speak now” with the microphone/WebRTC path and displayed “End voice conversation”. The session was then ended. Human speech recognition and audible speaker playback still require a user check; generated speech and received audio passed programmatically.

## Latest remote frontend merge

- Merged `origin/main` at `be34d40` into `codex/frontend-integration`, after checkpointing the voice reliability fixes at `81a6058`.
- Preserved the remote camera/walkthrough/view-cube controls, movable properties, local review issues and WebMCP tools, and compact/resizable/collapsible chat. The integrated app continues to upload original IFC files to the backend, query by model/revision/GUID, validate workbook schedules, and use real Astra/GPT-Live.
- Unified AI highlighting/isolation and manual review visibility in the review controller. Reset clears AI highlights and isolation; section changes retain highlights. Added a regression test for this shared state.
- The upstream browser speech/mock-chat path was replaced with our existing GPT-Live/Astra services. Explicit local scene/review commands remain available in text chat; other requests stream through the backend. Hiding chat closes voice capture without discarding text history.
- TypeScript and Docker production build passed; backend regression suite passed 16 tests with 3 opt-in live tests deselected. Frontend regression suite includes camera navigation, review, SSE, GUID/revision guards, and voice cleanup checks. Live paid AI calls and human microphone playback were not repeated for this merge.
- Final merged frontend suite: **25 passed**; together with the backend suite, **41 tests passed**. The deployed API smoke passed: 16 doors, 13 passing / 1 failing / 2 unknown schedule rows, 1 uncovered door, exact original IFC bytes, and CSV export.
- Browser smoke loaded the sample through the backend and rendered 496 model rows with the new scene controls and registered WebMCP tools. `Reset view` ran as a local review command through the integrated chat. Chat collapse/reopen worked and retained the conversation. This merge's live OpenAI/microphone behavior was not re-tested.
