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

To develop the frontend against the running Docker app instead of a separate
Python server, create `frontend/.env.local` with:

```dotenv
API_PROXY_TARGET=http://127.0.0.1:3000
```

Then start or restart `bun run dev`. Use the port printed by Vite (usually 5173).
If Compose uses a custom `PORT`, use that port in `API_PROXY_TARGET` too. This
setting is only read by the Vite server and contains no API keys. Remove it to
return to the default Python backend on port 8000. Production Docker uses Nginx
and does not need this setting.

If opening an IFC reports that the model service is unreachable, check
`/api/v1/health` on the same URL as the frontend. Start the backend or correct the
proxy target before retrying. Uploads check this connection before sending the
file, so an unavailable backend does not interrupt a large upload with an opaque
browser network error.

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

## AI-aided design review (IFC Lite adaptation)

Inspired by the workflow in [Autodesk's AI-aided design demo](https://github.com/autodesk-platform-services/ai-aided-design-demo), implemented against the existing local IFC Lite renderer. The local review controls require no Autodesk account or API key; Astra chat and GPT-Live still use the backend.

- The scene toolbar groups orbit/pan, zoom, isolate/hide, section, bounding-box measurement, IFC-class coloring, review issues, and reset. Colors have a scrollable legend. Reset clears visibility, section, colors, and measurement.
- Review issues capture selection, camera pose/up direction, isolation, hidden IDs, section, and colors when the draft is created. Editing the draft retains that viewpoint. Saving is separate from drafting. Open a saved issue to restore its view.
- Issues are stored in this browser's localStorage, keyed by SHA-256 of IFC file contents. Reopening the same file restores its issues. Different files with the same name cannot share issues. Storage is local, not a team issue tracker; assignees do not receive notifications.
- Ten typed WebMCP tools register on `document.modelContext` (with a legacy `navigator.modelContext` fallback): `get-view-state`, `browse-hierarchy`, `get-properties`, `measure-elements`, `set-view-state`, `set-theming-color`, `list-issues`, `show-issue`, `draft-issue`, `submit-issue`. Queries are scoped to the loaded model; hierarchy/property/issue lists paginate. `AI tools ready` means registration succeeded, not that an AI service is embedded. Browsers without WebMCP retain manual and local-command features.
- The built-in chat recognizes explicit local commands: `Isolate selected element`, `Hide selected element`, `Show all elements`, `Measure selected element`, `Color by type`, `Draft an issue`, `Show ISS-1`, `Reset view`. Other questions use real Astra through the backend. External WebMCP-capable agents can also use the registered browser tools.
- Voice uses GPT-Live WebRTC with backend Astra delegation. The new animated orb and compact voice button retain cancellation and startup progress. Hiding chat stops voice.
- Measurement uses axis-aligned geometry bounds in metres (Y is height). These are approximate extents, not exact surface dimensions or regulatory checks. Walkthrough uses WASD/arrows on the focused canvas, Q/E for elevation, and drag-to-look. Movement is 3 metres per second; it is free navigation without collision detection or gravity. Exact point-to-point measurement is not included.

Integration boundaries: `src/lib/review.ts` owns shared scene/review actions; `src/lib/webmcp.ts` exposes them to browser agents; `src/components/ReviewPanel.tsx` is the human review form. The existing `src/mock-api/` is retained only for legacy tests. Tool outputs and IFC property text are data, not agent instructions.

Properties can be moved by dragging their heading and resized with the bottom-right handle. Focus either handle and use arrow keys for keyboard adjustment. The panel stays within the scene when the surrounding splits change.


### Navigation controls and verification

Left-drag orbits; middle/right-drag and Shift-drag pan, including during walkthrough. Wheel zoom works in every navigation mode (pixel, line, and page wheel deltas are normalized). Pointer capture keeps dragging active outside the canvas and cancellation stops it. Walkthrough focuses the canvas; WASD/arrows move, Q/E change elevation, and Escape exits. Typing in chat does not move the camera. Home, view-cube faces, Reset, and restored issues exit walkthrough.

Navigation regression tests exercise the actual IFC Lite Camera with pointer, wheel and keyboard events, including pan/zoom after the renderer was restricted to orbit-only mode. The renderer must remain in `all` interaction mode: app-level event routing chooses the operation. Setting the renderer to `orbit` blocks its pan and zoom APIs.

Latest validation: 16 automated tests and production build passed; sample IFC load, wheel zoom, pan, walkthrough movement/exit, properties, isolation/section, coloring/measurement, issue restoration, local chat, and chat/sheet toggles checked in browser. XLSX serialization is covered by a workbook round-trip test. Physical middle-button hardware and microphone conversation were not exercised by browser automation; middle-button event routing is covered by the real-camera regression test. Walkthrough remains free navigation without collision/gravity.
