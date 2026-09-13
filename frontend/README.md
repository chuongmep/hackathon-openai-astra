# Forma frontend

A React + TypeScript IFC workspace. All application, mock API, sample asset, and Docker files live in this folder. No backend or API keys are required.

## Run locally

```sh
cd frontend
bun install --frozen-lockfile
bun run dev
```

Open the localhost URL printed by Vite. Use a current WebGPU-capable Chrome or Edge browser. WebGPU and microphone access require localhost or HTTPS.

## Docker Compose

Start Docker Desktop / the Docker daemon first:

```sh
cd frontend
docker compose up --build -d
```

Open http://localhost:8080. The multi-stage image builds with Bun and serves static files through Nginx. The server includes the isolation headers required by the WASM viewer. For remote hosting, terminate HTTPS in front of Nginx.

## Workspace

- Open IFC or drop a `.ifc` file on the viewer. **Sample model** opens the copy of `assets/racbasicsampleproject.ifc` bundled under `public/models`.
- Orbit with left drag, pan with Shift/right/middle drag, and zoom with the wheel. Fit to view resets the camera.
- Browse the actual project/site/building/storey hierarchy or search element names, types, and IDs. Selection is shared with the renderer and sheet. Selecting an element in the tree, scene, or sheet opens the scrollable properties panel on the right inside the scene. Close it with its X and reopen it using View properties; the model tree remains visible.
- Drag the tree divider and sheet divider to resize. Focus a divider and use arrow keys for keyboard resizing.
- Close/reopen the sheet with its chevron. Scroll horizontally/vertically, filter rows, select an element, or export the filtered dataset to `.xlsx`.
- ExcelJS creates the workbook with styled headers, frozen header row, and filters. The browser sheet is a read-only React table, not an ExcelJS UI widget. Rows represent unique geometry element IDs, not every low-level IFC record.
- Chat responses are explicitly mocked, using real model metadata for summaries, class counts, and selection descriptions.
- Voice uses browser SpeechRecognition and speech synthesis for turn-by-turn conversation with mock replies. Allow microphone access when prompted. Browser speech services may process audio remotely; IFC parsing itself stays in the browser. Unsupported browsers show a text fallback. This is not a realtime AI connection.

## Structure and backend integration

- `src/App.tsx`: workspace layout, loading lifecycle, linked selection, sheet.
- `src/components/ModelTree.tsx`: recursive hierarchy.
- `src/components/ChatPanel.tsx`: chat and browser voice lifecycle.
- `src/lib/viewer.ts`: IFC Lite renderer, camera controls, resize observer, disposal.
- `src/lib/model.ts`: metadata adapter, property access, lazy ExcelJS export.
- `src/mock-api/index.ts`: typed `ModelAssistantAPI`, `ChatRequest`, and `ChatResponse`. Replace the exported adapter with an HTTP implementation to integrate a backend. Add server-side authentication/AI credentials there later; never put secrets in frontend environment variables.

The model is session-only. Reloading clears it. Font styling uses Google Fonts with local sans-serif fallback. Large model parsing and sheet rendering are not virtualized; introduce worker parsing and row virtualization for very large models.

## Checks

```sh
bun run typecheck
bun test
bun run build
bun run format:check
docker compose config --quiet
```

The Bun tests parse the bundled IFC and verify hierarchy, identity, property sets, row deduplication, and mock chat behavior. Browser smoke testing verified the sample renders (483 unique geometry elements). Docker configuration validates; container execution requires a running Docker daemon. Voice input still needs a manual microphone smoke test. Scene picking, property display, filtering, sheet collapse/expand, and model-aware chat were also verified. Workbook serialization is round-trip tested; the in-app browser did not expose a download event, so saving the XLSX through that browser was not confirmed. IFC Lite reports CSG fallback warnings for some sample wall openings; this viewer does not guarantee exact geometry for those openings.

## References

- [IFC Lite](https://github.com/LTplus-AG/ifc-lite): parser, WASM geometry, WebGPU renderer. Camera/session code adapted from its MPL-2.0 React starter; source license notice retained in `src/lib/viewer.ts`.
- [ExcelJS](https://github.com/exceljs/exceljs): XLSX workbook generation.
- [Bun](https://bun.com/): package installation and scripts; Vite handles the browser bundle and module workers.
