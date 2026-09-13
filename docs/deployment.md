# Docker deployment and verification

Run these commands from the repository root with Docker Desktop running. The stack builds the React/IFC Lite frontend with locked Bun dependencies and the FastAPI/IfcOpenShell backend with locked uv dependencies.

The frontend Docker build runs its unit tests and TypeScript checks before producing the Nginx image. Backend regressions and the deployed workflow are checked with the commands below.

## Start both services

```sh
# First setup only. Preserve an existing .env when updating.
cp .env.example .env
# Optionally set OPENAI_API_KEY in .env for Astra chat and GPT-Live voice.
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps
```

Open [Forma](http://localhost:3000) or the [API documentation](http://localhost:3000/api/docs). Both services should report `healthy`. The frontend waits for backend readiness. Set `PORT` in `.env` if port 3000 is occupied. If credentials are kept in `backend/.env`, add `--env-file backend/.env` immediately after `docker compose` in every command that starts or recreates services.

Nginx serves the production frontend and proxies `/api/` to the internal backend. Only Nginx publishes a host port, bound to `127.0.0.1`. Browser isolation headers support the IFC runtime; streaming proxy settings support chat and voice events. For a remote deployment, provide HTTPS and access control through your hosting environment; the current Compose file is a local deployment.

## Check the deployed workflow

```sh
docker compose --profile test run --build --rm --no-deps smoke
```

Run this after both services are healthy. `--no-deps` keeps the smoke check from recreating running application containers. This one-shot container uses a read-only mount of `assets/` and talks to Nginx over the Compose network. It checks:

- Frontend HTML/JavaScript, original sample file, browser isolation headers, and correct missing-WASM responses.
- Backend health and OpenAPI routing through the frontend proxy.
- IFC upload, exact original-file retrieval, SHA-256 revision, and 16 sample doors.
- Workbook upload and material validation: 13 pass, 1 intentional fail, 2 unknown, 1 uncovered door.
- CSV report export and actionable missing-credential errors when AI is unconfigured.

Each run creates new demo model, workbook, and report records in the application volume. It does not call OpenAI. A successful check exits with code 0 and prints the report path; replace the internal `http://frontend` origin with `http://localhost:3000` to open it on the host.

## Run source regression checks

These commands require local Bun and uv; use the versions pinned in the Dockerfiles for matching build runtimes.

```sh
cd frontend
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
cd ..
uv sync --project backend --frozen
uv run --project backend pytest backend/tests -m 'not live'
uv run --project backend ruff check --config backend/pyproject.toml backend/app backend/tests backend/scripts
```

Live tests require model access and credentials; see the root README. Browser checks should include loading the sample, selecting an object, changing views, opening the model sheet, checking a schedule, and collapsing/reopening chat. Human microphone capture, audible playback, and physical mouse navigation require their own interactive checks.

## Update, stop, and preserve data

```sh
# Rebuild changed code and wait for healthy services.
docker compose up --build -d --wait --wait-timeout 180
# Inspect recent logs.
docker compose logs --tail=100 backend frontend
# Stop and remove containers while preserving uploaded files and reports.
docker compose down
```

IFC files, workbooks, and SQLite records live in the `astra-data` named volume. Do not add `--volumes` when stopping if you want to preserve them. Active voice sessions are in memory and must be restarted after a backend restart. Keep one backend worker as configured.
