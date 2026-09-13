# Forma frontend + Astra backend

The teammate's React/TypeScript workspace now connects to the Python backend. Its IFC Lite viewer, hierarchy, properties, resizable panels, and ExcelJS export are preserved. Chat uses real Astra tools; voice uses GPT-Live WebRTC with backend delegation.

## Run the complete app

From the repository root, with Docker Desktop running:

```sh
docker compose --env-file backend/.env up --build -d
```

Open http://localhost:3000. If your key is in the root `.env`, omit `--env-file backend/.env`. No API credentials belong in frontend environment variables. Upload, querying, and direct material checks work without an OpenAI key.

For frontend development, run the backend on `127.0.0.1:8000`, then:

```sh
cd frontend
bun install --frozen-lockfile
bun run dev
```

Vite proxies `/api` to the backend. Use a WebGPU-capable browser on localhost or HTTPS.

## Demo and data ownership

1. Click **Sample model** or **Open IFC**. The file is uploaded to the backend; the viewer then loads the backend's exact original bytes. The model table uses backend occurrence membership, resolving each GUID through the local parser.
2. Ask **How many doors are there? Show them.** The sample has 16 doors. Astra requests highlighting through the viewer action contract.
3. Upload `assets/demo-door-schedule.xlsx` in the bottom sheet. Use `Door Schedule`, `GlobalId`, `ExpectedMaterial`, and header row 1.
4. Click **Check materials** or ask chat to validate the schedule and isolate failures. Expected results: 13 pass, 1 fail, 2 unknown, 1 uncovered. Export findings as CSV or return to **Model rows** to export IFC metadata as XLSX.
5. Click a finding, scene object, or model row to provide selected-object context. The properties panel includes backend effective materials, inherited properties, quantities, and provenance.
6. **Start voice conversation** uses GPT-Live audio. **End voice conversation** closes the peer, microphone tracks, event subscription, and backend session. A replacement model closes the old chat/voice context.

The active model ID and revision accompany chat, voice, and viewer actions. Stale actions are ignored. GUIDs are resolved by the frontend parser before numeric renderer operations; backend Express IDs are not blindly used as viewer IDs. Fit model to view resets isolation and highlights.

The backend owns factual results and persistent files. The frontend owns scene rendering and conversation presentation. Reloading clears browser workspace state; uploaded files remain in the backend volume. Real AI features send relevant tool-selected metadata and conversation/audio to OpenAI. No IFC editing is exposed.

## Code and verification

- `src/lib/api.ts`: HTTP upload/query helpers and POST SSE parser.
- `src/lib/voice.ts`: GPT-Live WebRTC client and context updates.
- `src/lib/actions.ts`: model/revision guard and GUID resolution.
- `src/components/ChatPanel.tsx`: streamed chat and live voice UI.
- `src/components/ValidationPanel.tsx`: schedule mappings, validation, evidence rows, and CSV export.
- `src/lib/viewer.ts`, `src/lib/model.ts`: original renderer/camera and ExcelJS integration.

```sh
bun test
bun run build
bun run format:check
```

The original `src/mock-api` remains as an unused fixture for its existing tests; the running app does not import it. See [API contract](../docs/frontend-integration.md) and [verification record](../docs/verification.md). Human microphone/speaker and interruption behavior still require manual validation on the target browser.
