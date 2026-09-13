# Forma

Read-only IFC model questions and door-material schedule checks, with a local 3D viewer, Astra chat, and GPT-Live voice integration.

## Run locally with Docker

Requirements: Docker Desktop, Git, and a WebGPU-capable browser. OpenAI access is only needed for chat/voice.

```sh
cp .env.example .env
# Set OPENAI_API_KEY in .env to enable AI features.
docker compose up --build -d
```

Open [the workbench](http://localhost:3000) and [interactive API docs](http://localhost:3000/api/docs). Only the frontend is published, bound to localhost. IFC files and reports persist in the `astra-data` Docker volume. `docker compose down` preserves that volume.

If your key is in `backend/.env`, load that file explicitly: `docker compose --env-file backend/.env up -d`. After changing the key, rerun that command to recreate the backend with the updated environment. Plain Compose commands read the root `.env` by default.

The default frontend image builds `frontend/` with Bun and its locked, published IFC Lite parser/geometry/renderer packages. No reference checkout or Git submodule is required. `frontend-mock/` is archived source from the earlier integration prototype; use `frontend/` for development and deployment.

## Demo materials

- [Forma PowerPoint project demo](assets/Forma-Project-Demo.pptx): 11 slides covering the problem, team use cases, visual classification example, demo workflow, and illustrative time and cost savings.
- [Sample IFC model](assets/racbasicsampleproject.ifc).
- [ASTM UniFormat reference workbook](assets/ASTM-UniFormat.xlsx).
- [Marketing video source and rendering instructions](marketing/README.md). The film illustrates the product vision rather than recording the live application.


## Demo

1. Load `assets/racbasicsampleproject.ifc` (IFC2X3, 16 doors).
2. Ask **How many doors are in this house? Show them.** Chat uses the backend's IFC tools and requests highlighting.
3. Load `assets/demo-door-schedule.xlsx`; leave `Door Schedule`, `GlobalId`, `ExpectedMaterial`, and header row `1` selected.
4. Click **Check materials**. Expected: **13 pass, 1 fail, 2 unknown, 1 uncovered door**. The schedule is intentionally synthetic, not a project specification.
5. Click **Isolate failures**, click a finding to select/frame its object, inspect its properties, or export CSV.
6. With GPT-Live access, start voice and ask **Check the door materials against the schedule and show the failures.** Stop voice to release the microphone and server connection.

The supplied UniFormat workbook is a classification reference and is preserved for later mapping work. It is not the demo material schedule. IFC editing, classification mapping, pricing, and building-code certification are outside this release.

Check the deployed upload/query/validation/export flow without OpenAI credentials (creates fresh demo records):

```sh
uv run --project backend python backend/scripts/smoke_demo.py
```

## Backend development

```sh
uv sync --project backend --frozen
uv run --project backend pytest backend/tests -m 'not live'
uv run --project backend ruff check --config backend/pyproject.toml backend/app backend/tests backend/scripts
uv run --project backend uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --env-file .env
```

The backend uses Python 3.12. `DATA_DIR` defaults to `./data` relative to the process working directory; set it explicitly when switching between commands. One Uvicorn worker owns a two-model LRU cache and in-memory voice sessions. Immutable files and SQLite records survive process restarts; voice sessions do not.

Regenerate the synthetic schedule without modifying the IFC:

```sh
cd backend
uv run python -m scripts.create_demo_schedule ../assets/racbasicsampleproject.ifc ../assets/demo-door-schedule.xlsx
```

## Integrated frontend development

See [frontend/README.md](frontend/README.md) for the default app, local development, and the live demo workflow.

## Archived mock

`frontend-mock/` is retained for historical reference only. Its local SDK dependencies and Dockerfile relied on the removed IFC Lite checkout and are not supported build targets. The root Compose deployment uses `frontend/`.

## AI and voice

- `ASTRA_MODEL=gpt-6-astra`: OpenAI Responses streaming and a bounded loop of typed, read-only tools.
- `VOICE_MODEL=gpt-live-1`: WebRTC audio plus a server-side WebSocket attachment. Client delegation invokes the same Astra runner as text chat.
- The installed OpenAI Python SDK handles Responses. Live uses its documented HTTP/WebSocket protocol directly because the installed SDK does not expose the Live resource.
- Missing credentials return `503 openai_not_configured`; IFC APIs and direct validation keep working. There are no fake model responses.
- Model properties and spreadsheet cells are treated as untrusted data. Keys remain server-side. No arbitrary code execution tools are exposed.
- Sessions expire after ten minutes and are capped at four. Closing voice cancels pending tasks and releases local resources. Changes to selection/model/schedule invalidate in-flight results.
- Original IFC bytes stay in the local backend/viewer. Tool-selected metadata, conversation context, and voice audio are sent to OpenAI when those features are used.

Live tests are opt-in and require access to the requested models:

```sh
RUN_LIVE_TESTS=1 uv run --project backend pytest backend/tests/test_live.py -v
```

To load `backend/.env` and generate a silent WebRTC offer automatically:

```sh
RUN_LIVE_TESTS=1 uv run --project backend --env-file backend/.env --with aiortc pytest backend/tests/test_live.py -v
```

The live workflow tests use generated IFC/workbook fixtures, not uploaded project data. Voice can also use `LIVE_SDP_FILE`, an SDP offer from a browser. End-to-end microphone playback and interruption handling require a manual browser session; a successful silent transport test does not verify spoken delegation.

See [frontend integration contract](docs/frontend-integration.md) and [verification record](docs/verification.md).

Official protocol references: [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Live delegation](https://developers.openai.com/api/docs/guides/live-delegation), [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [server controls](https://developers.openai.com/api/docs/guides/voice-server-controls), [IfcOpenShell](https://docs.ifcopenshell.org/ifcopenshell-python/code_examples.html).

## Integrated frontend navigation and review

The frontend includes the latest orbit/pan/walk controls, view cube, section cuts,
coloring and approximate measurements, movable properties, and locally saved
review issues. Chat can be resized or collapsed; collapsing it ends voice capture.
Backend AI actions and manual review controls share selection and visibility state.
Text questions use Astra and voice uses GPT-Live; the legacy mock adapter is unused
by the running app. See [the frontend guide](frontend/README.md) for controls and limits.

![Frontend workspace](assets/frontend-demo.png)

## Team

| Member | Email |
| --- | --- |
| Chuong Ho | [chuongpqvn@gmail.com](mailto:chuongpqvn@gmail.com) |
| Wonseok | [wonseoklee.dev@gmail.com](mailto:wonseoklee.dev@gmail.com) |

## Acknowledgments

The frontend uses IFC Lite and ExcelJS. Its design review workflow draws inspiration from Autodesk's AI-aided design demo. See the [frontend guide](frontend/README.md) and retained source notices for attribution.

## Community and project support

Connect with [OpenAI Developers](https://luma.com/fdzbrq5b?tk=TXkf6G).

Explore and support these projects. Visit their official pages for contribution, sponsorship, or donation options where available:

- **IfcOpenShell:** [GitHub repository](https://github.com/ifcopenshell/ifcopenshell) · [Official website](https://ifcopenshell.org/)
- **uv:** [Documentation](https://docs.astral.sh/uv/)
- **IFC Lite:** [GitHub repository](https://github.com/LTplus-AG/ifc-lite)
- **Impeccable:** [Official website](https://impeccable.style/)
- **Remotion:** [Official website](https://www.remotion.dev/)
