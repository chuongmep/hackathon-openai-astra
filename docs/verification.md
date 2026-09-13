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

- Initial checks had no API key. Follow-up live results are recorded below. Microphone playback, interruption, and spoken result delivery remain **unverified**.
- ifc-lite logged three CSG failures across two sample products while still rendering the scene. Geometry fidelity for every object/opening was not audited. Deterministic counts and materials come from IfcOpenShell, independently of viewer geometry.
- The temporary table renders backend JSON with ordinary React HTML; it is not a full spreadsheet editor. Workbook parsing/export belongs to the backend. The teammate can replace the mock through the documented API.
- This release has no authentication, multi-worker coordination, or persistent voice-session recovery. Compose publishes only to localhost.

## Live follow-up with backend/.env

- Loaded the user-provided key into the deployed backend using `docker compose --env-file backend/.env up -d --force-recreate backend`. No key value was printed or committed; nested `.env` files are excluded from Docker context as well as Git.
- The Models API accepts both exact requested IDs: `gpt-6-astra` and `gpt-live-1`.
- Real Astra function-call smoke passed. A live integration test using generated three-door IFC4 data passed all three workflows: count/highlight all three doors; identify Timber on the selected occurrence; validate synthetic material rows (one pass, one fail, one unknown), then isolate/frame the failed door. These use the application's actual deterministic tools and streamed Responses runner.
- Real GPT-Live transport smoke passed: session creation HTTP 201, authenticated backend WebSocket attachment, WebRTC connection state `connected`, then session closure and peer cleanup. The SDP offer was generated with aiortc; no microphone audio was captured. aiortc is an optional test runtime, not a backend deployment dependency.
- Automatic approval review rejected the attempted live test on existing uploaded project data. No project IFC/workbook data was sent by that rejected command; the live tests above used only synthetic fixtures. The 16-door project + real-AI acceptance flow still needs approval for sending its tool-selected metadata to OpenAI.
