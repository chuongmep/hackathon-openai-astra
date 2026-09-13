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
- Orbit with left drag, pan with Shift/right/middle drag, and zoom with the wheel. The upper-left orientation cube offers top/front/right views, with all six directions in its Views menu and an isometric/orbit reset.
- The bottom scene toolbar provides zoom in/out, isolate selected element / show all, and section cuts. Section settings expose X/Y/Z axes, position, and flip direction. Reset view restores all elements, clears the cut, and fits the model.
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

## AI-aided design review (IFC Lite adaptation)

Inspired by the workflow in [Autodesk's AI-aided design demo](https://github.com/autodesk-platform-services/ai-aided-design-demo), implemented against the existing local IFC Lite renderer. No Autodesk account, model translation, server, or API key is needed.

- The scene toolbar groups orbit/pan, zoom, isolate/hide, section, bounding-box measurement, IFC-class coloring, review issues, and reset. Colors have a scrollable legend. Reset clears visibility, section, colors, and measurement.
- Review issues capture selection, camera pose/up direction, isolation, hidden IDs, section, and colors when the draft is created. Editing the draft retains that viewpoint. Saving is separate from drafting. Open a saved issue to restore its view.
- Issues are stored in this browser's localStorage, keyed by SHA-256 of IFC file contents. Reopening the same file restores its issues. Different files with the same name cannot share issues. Storage is local, not a team issue tracker; assignees do not receive notifications.
- Ten typed WebMCP tools register on `document.modelContext` (with a legacy `navigator.modelContext` fallback): `get-view-state`, `browse-hierarchy`, `get-properties`, `measure-elements`, `set-view-state`, `set-theming-color`, `list-issues`, `show-issue`, `draft-issue`, `submit-issue`. Queries are scoped to the loaded model; hierarchy/property/issue lists paginate. `AI tools ready` means registration succeeded, not that an AI service is embedded. Browsers without WebMCP retain manual and local-command features.
- The built-in chat recognizes explicit local commands: `Isolate selected element`, `Hide selected element`, `Show all elements`, `Measure selected element`, `Color by type`, `Draft an issue`, `Show ISS-1`, `Reset view`. Other questions use the existing mock adapter. Flexible AI requests come through an external WebMCP-capable agent.
- Voice uses browser recognition/synthesis and an animated active-session orb; it is not OpenAI Realtime or an embedded ChatGPT session. No model selector is shown because there is no configured AI provider.
- Measurement uses axis-aligned geometry bounds in metres (Y is height). These are approximate extents, not exact surface dimensions or regulatory checks. Walkthrough uses WASD/arrows on the focused canvas, Q/E for elevation, and drag-to-look. Movement is 3 metres per second; it is free navigation without collision detection or gravity. Exact point-to-point measurement is not included.

Integration boundaries: `src/lib/review.ts` owns shared scene/review actions; `src/lib/webmcp.ts` exposes them to browser agents; `src/components/ReviewPanel.tsx` is the human review form. The existing `src/mock-api/` remains the replacement point for a later chat backend. Tool outputs and IFC property text are data, not agent instructions.

Properties can be moved by dragging their heading and resized with the bottom-right handle. Focus either handle and use arrow keys for keyboard adjustment. The panel stays within the scene when the surrounding splits change.


### Navigation controls and verification

Left-drag orbits; middle/right-drag and Shift-drag pan, including during walkthrough. Wheel zoom works in every navigation mode (pixel, line, and page wheel deltas are normalized). Pointer capture keeps dragging active outside the canvas and cancellation stops it. Walkthrough focuses the canvas; WASD/arrows move, Q/E change elevation, and Escape exits. Typing in chat does not move the camera. Home, view-cube faces, Reset, and restored issues exit walkthrough.

Navigation regression tests exercise the actual IFC Lite Camera with pointer, wheel and keyboard events, including pan/zoom after the renderer was restricted to orbit-only mode. The renderer must remain in `all` interaction mode: app-level event routing chooses the operation. Setting the renderer to `orbit` blocks its pan and zoom APIs.

Latest validation: 16 automated tests and production build passed; sample IFC load, wheel zoom, pan, walkthrough movement/exit, properties, isolation/section, coloring/measurement, issue restoration, local chat, and chat/sheet toggles checked in browser. XLSX serialization is covered by a workbook round-trip test. Physical middle-button hardware and microphone conversation were not exercised by browser automation; middle-button event routing is covered by the real-camera regression test. Walkthrough remains free navigation without collision/gravity.
