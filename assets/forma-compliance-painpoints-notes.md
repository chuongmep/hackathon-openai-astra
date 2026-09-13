# Forma compliance pain points

Created with the built-in image-generation tool for the hackathon presentation. Final image: forma-compliance-painpoints.png.

## Verified sources

- assets/ASTM-UniFormat.xlsx, ASTM 2015 A1:B7: classification catalogue, 2015 edition, classification number/description parameters and eight column headers. No GlobalId or expected-material fields.
- ASTM 2015 A8:H817: 810 populated code-description rows, including the hierarchy root; five levels. Level counts: 1 at level 1, 12 at level 2, 53 at level 3, 209 at level 4 and 535 at level 5. This is an entry count, not 810 different building parts.
- ASTM 2015 A186:D186: B2010 Exterior Walls.
- ASTM 2015 A195:D195: B2020 Exterior Windows, Revit category -2000014.
- ASTM 2015 A250:D250: C1020 Interior Windows, same Revit category -2000014. This supports the point that category alone does not establish the appropriate classification.
- frontend/src/components/ValidationPanel.tsx and frontend/src/lib/schedule.ts: material validation UI requires a mapped Global ID and expected-material column. The classification catalogue alone is not a material schedule.
- Live frontend at localhost:5173 was inspected. Sample loading returned Internal Server Error; live model validation was not verified. Saved assets/frontend-demo.png was inspected as the loaded-model visual reference; it is from an earlier frontend version.

The three pain points are workflow inferences from these sources. The wrong window label and rendered building are illustrative, not a finding in the sample IFC. No measured review time, error rate or financial saving is asserted. Classification assistance is presented as a development concept. No workbook or application code was changed.

## Image generation prompt

Create a polished high resolution landscape 16:9 infographic for a Forma construction hackathon presentation. The audience is ordinary nontechnical people. Explain the PAIN POINTS of reviewing a 3D building model against an Excel classification catalogue. Do not make this just another solution workflow. Inputs: image 1 is a saved real Forma frontend screenshot, a REFERENCE ONLY for the muted sage/teal palette and linked model-tree/3D-view/data-table layout. Image 2 is a style reference for realistic architectural cutaway imagery, clear labels and ivory cards. Recompose freely. This output is a conceptual infographic, not a real app screenshot. Deliver one crisp complete image, 3072x1728 if possible, no cropped words, ample padding.

STYLE: refined architectural presentation, warm ivory background, dark charcoal highly legible typography, dark teal and sage for model/reference elements, restrained amber highlighting for review problems. Premium detailed isometric cutaway two-storey modern house with glazed windows, an interior partition window clearly visible between rooms, white structural walls, subtle technical grid. Large enough that people instantly recognize the building parts. No cartoon people, no robot heads, no generic abstract AI circles, no dense tiny interface text.

TOP: small wordmark "Forma". Main large heading exactly "Why checking model data takes so much effort". One short subtitle exactly "Find the object. Choose the right code. Keep the evidence."

MIDDLE MAIN ILLUSTRATION occupies about half the canvas:
On LEFT a simplified frontend-inspired view containing the cutaway house, small model tree and property panel. Highlight an exterior window in amber. Attach a clearly illustrative property card reading "Selected object: exterior window", then "Model label: B2010 · Exterior Walls", plus a small amber "Needs review". The building should show the selected exterior window clearly as glass in an exterior wall, not a door. Label another interior partition window with a small readable "Interior window" tag to demonstrate that visually similar objects serve different roles.
On RIGHT a beautifully legible enlarged Excel-style sheet titled "ASTM 2015 classification reference", subtitle "810 entries across 5 levels". Columns exactly "Code" and "Description". Three rows exactly "B2010" / "Exterior Walls"; "B2020" / "Exterior Windows"; "C1020" / "Interior Windows". Highlight B2020 in pale teal. Beneath the table in small readable type: "The same window category can need different codes." Between the selected object card and reference table, one amber dashed connector with a question mark signals the human matching task. It must be clear the spreadsheet is a separate reference catalogue, not the building's own data. A small spreadsheet-row marker and a building-selection marker visually show the difficulty linking the two.

LOWER THREE EQUAL OPEN SECTIONS, very readable, sparse, each with a simple relevant line icon and large number 01 02 03. Exactly these short headings and descriptions:
01 "Time spent searching"
"Find the right entry and level in a long reference list."
02 "Easy to choose the wrong code"
"Exterior and interior windows look similar but use different classifications."
03 "Findings lose their context"
"Reconnect the spreadsheet row, building object, and review evidence."
These are inferred workflow pains, do not invent measured times, dollar savings or error statistics.

BOTTOM: a narrow understated teal-tinted strip reading "Forma's goal: connect the 3D object, its data, and the reference for review." Small footer: "Illustrative example. Classification assistance is a development concept."
Do NOT include pass/certified icons, automated safety approval, building-code claims, material names or material-compliance checks. The provided workbook is a UniFormat classification catalogue and has no per-object GlobalId or expected-material columns. Do not suggest that this exact workbook can directly run the current frontend's material checks. All example labels must be spelled accurately and in English. Use ONLY the exact copy requested above; avoid extra paragraphs, logos or text. Clear hierarchy and generous whitespace, architectural visual should dominate, not boxes of prose.

