# Forma

A hackathon project for reviewing construction model data in a 3D workspace, built for modeling and cost estimation teams.

Explore IFC building models, inspect individual objects, and record findings with their visual context. The project aims to extend this workflow with Astra-powered conversation, standards mapping, and compliance review.

The current application uses **Forma** as its interface name. **Forma** is the hackathon project name.

## Demo preview

![Frontend demo with the sample IFC building loaded, showing the 3D viewer, model hierarchy, element data sheet, and model assistant](assets/frontend-demo.png)

Actual frontend screenshot with `racbasicsampleproject.ifc` loaded (483 elements). The workspace connects the building view with its model hierarchy and element data. The built-in assistant uses local commands and mock answers.

## Demo materials

- [PowerPoint project demo](assets/Astra-IFC-Complience-Comparison.pptx), including the team and a manual-versus-app comparison.
- [Sample IFC model](assets/racbasicsampleproject.ifc).
- [ASTM UniFormat reference workbook](assets/ASTM-UniFormat.xlsx).
- [Marketing video source and rendering instructions](marketing/README.md). The film illustrates the product vision rather than recording the live application.

## What it does

- **Explore a building in 3D:** import an IFC file, orbit, pan, zoom, change viewpoints, or use walkthrough navigation.
- **Inspect model entities:** browse the spatial hierarchy and select the same object across the model tree, scene, and data sheet.
- **Review objects in context:** inspect properties, isolate or hide elements, apply section cuts, and color elements by IFC class.
- **Record findings:** draft review issues, save them locally, and restore their saved viewpoints later.
- **Export data for estimation work:** filter the element sheet and export it to Excel.
- **Control the workspace through tools:** expose model inspection and review actions to a compatible external browser agent through WebMCP.

## Astra and implementation status

The intended hackathon focus areas are **Best use of GPT-Live-1**, **Best example of Visual Understanding**, and **Best use of Agents API**. These describe the integration vision, not verified integrations or award wins.

| Capability | Current status |
| --- | --- |
| IFC import, 3D navigation, properties, and linked selection | Implemented in the frontend |
| Filtered Excel export | Implemented |
| Local issues with saved viewpoints | Implemented using browser storage |
| Model tools for an external agent | Ten WebMCP tools, available when the browser supports registration |
| Built-in model conversation | Explicit local commands plus mock answers based on model metadata |
| Voice interaction | Browser speech recognition and synthesis, not a live OpenAI connection |
| GPT-Live-1 and Agents API integration | Not configured in this repository |
| AI standards mapping and compliance reasoning | Planned; the reference workbook is included |
| Approved mapping updates and model write-back | Planned |

The proposed AI workflow is to read a standard, suggest mappings using object properties and visual context, explain the supporting evidence, and let the modeler approve changes. The current prototype does not automatically certify compliance or calculate construction estimates.

## Quick start

Requirements: **Bun 1.3.0** (the version declared by the frontend) and a WebGPU-capable browser such as Chrome or Edge. The current prototype needs no backend or API keys.

Run from the repository root:

```sh
cd frontend
bun install --frozen-lockfile
bun run dev
```

Open the localhost URL printed by Vite, then choose **Sample model** or **Open IFC**. You can also drop an IFC file onto the viewer.

WebGPU and microphone features require localhost or HTTPS. Voice availability depends on browser support.

### Docker

With Docker and its Compose plugin running:

```sh
cd frontend
docker compose up --build -d
```

Open [localhost:8080](http://localhost:8080). The container builds the frontend and serves it through Nginx. Use HTTPS when hosting remotely.

## Suggested hackathon demo

1. Open the sample IFC model and browse its building hierarchy.
2. Select a wall or another element and inspect its properties.
3. Ask **Tell me about the selected element** to demonstrate the metadata-based mock response.
4. Enter **Isolate selected element**, inspect the object, and restore visibility with **Show all elements**.
5. Enter **Draft an issue**, review the details, and save it. Reopen the issue to restore its viewpoint.
6. Filter the model data sheet and choose **Export .xlsx**.
7. Describe AI standards mapping and live Astra conversation as the next integration step, or demonstrate a separately configured external agent.

Other supported local commands include `Hide selected element`, `Measure selected element`, `Color by type`, `Show ISS-1`, and `Reset view`.

## Value for construction teams

| Review activity | Manual workflow example | With the app |
| --- | --- | --- |
| Find and inspect objects | Cross-check model views and schedules | Use linked geometry, hierarchy, and properties |
| Record findings | Capture screenshots and separate notes | Save issues with their viewpoints |
| Prepare element data | Compile an element list by hand | Filter model data and export Excel |

The intended benefits are easier data verification, traceable reviews, and a clearer handoff between modelers and estimators.

**Illustrative savings only:** if the same review takes 8 hours manually and 4 hours with the app, it saves 4 hours, or 50%. At an assumed US$50 per staff-hour, gross labor cost falls from US$400 to US$200 per review. These are scenario assumptions, not measured product results. Net savings must account for app, AI, setup, and training costs. This example concerns review labor, not total construction cost.

## Architecture

The frontend uses React, TypeScript, and Vite. IFC Lite provides parsing, geometry processing, and WebGPU rendering. ExcelJS creates the exported workbooks.

| Location | Purpose |
| --- | --- |
| `frontend/src/App.tsx` | Model loading, workspace layout, and linked selection |
| `frontend/src/lib/viewer.ts` | Renderer and camera interactions |
| `frontend/src/lib/model.ts` | Model metadata, properties, and Excel export |
| `frontend/src/lib/review.ts` | Scene actions, local commands, and issue persistence |
| `frontend/src/lib/webmcp.ts` | Typed tools for compatible browser agents |
| `frontend/src/components/ChatPanel.tsx` | Chat and browser speech interaction |
| `frontend/src/mock-api/` | Mock assistant adapter and future backend integration point |
| `frontend/tests/` | Automated model, review, and navigation checks |
| `backend/` | Reserved for future backend implementation; currently empty |
| `assets/` | Sample model, standards workbook, and presentation |
| `marketing/` | Editable product film source and rendering instructions |

### Agent tools

The workspace exposes `get-view-state`, `browse-hierarchy`, `get-properties`, `measure-elements`, `set-view-state`, `set-theming-color`, `list-issues`, `show-issue`, `draft-issue`, and `submit-issue`.

`AI tools ready` means tool registration succeeded. It does not mean an AI provider is embedded. Browsers without WebMCP retain manual controls and local commands. Saving an issue is separate from drafting it and requires an explicit user request.

To add a live assistant, replace the mock adapter with a backend implementation. Keep provider credentials on the server, not in the frontend bundle.

## Development checks

Run from `frontend/`:

```sh
bun run typecheck
bun test
bun run build
bun run format:check
docker compose config --quiet
```

See the [frontend README](frontend/README.md) for detailed controls, integration notes, and recorded validation boundaries.

## Current limitations

- The loaded model is session-only. Reloading requires opening it again. Review issues persist in the same browser, keyed by a hash of the IFC file contents.
- Local issues are not a shared team tracker. Assigning a person does not send a notification.
- Measurements are approximate axis-aligned bounding-box dimensions, not exact quantities or regulatory checks.
- Walkthrough is free navigation without collision detection or gravity.
- General chat answers are mocked. Browser voice is not a realtime AI connection, and browser speech services may process audio remotely.
- Large models may need further parsing and table-rendering optimization. Some sample openings use geometry fallbacks.
- Excel export provides element data; it does not update the IFC model or produce a priced estimate.

## Team

| Member | Email |
| --- | --- |
| Chuong Ho | [chuongpqvn@gmail.com](mailto:chuongpqvn@gmail.com) |
| Wonseok | [wonseoklee.dev@gmail.com](mailto:wonseoklee.dev@gmail.com) |

## Acknowledgments

The frontend uses IFC Lite and ExcelJS. Its design review workflow draws inspiration from Autodesk's AI-aided design demo. See the [frontend references](frontend/README.md#references) and retained source notices for attribution.
