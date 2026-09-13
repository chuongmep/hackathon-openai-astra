import type { ReviewController, ColorGroup } from "./review";
type Args = Record<string, unknown>;
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  execute: (args: Args) => Promise<{
    content: { type: "text"; text: string }[];
    isError?: boolean;
  }>;
};
type Context = {
  registerTool: (
    tool: Tool,
    options?: { signal: AbortSignal },
  ) => void | Promise<void>;
  unregisterTool?: (name: string) => void;
};
const number = { type: "integer", minimum: 0 };
const string = { type: "string" };
const ids = {
  type: "array",
  items: { type: "integer" },
  minItems: 1,
  maxItems: 500,
};
function text(a: Args, key: string) {
  if (typeof a[key] !== "string") throw new Error(`${key} must be text`);
  return a[key] as string;
}
function elementIds(a: Args) {
  if (!Array.isArray(a.ids) || a.ids.some((id) => !Number.isInteger(id)))
    throw new Error("ids must be an array of integers");
  return a.ids as number[];
}
function page<T>(values: T[], a: Args) {
  const offset = Number(a.offset ?? 0),
    limit = Number(a.limit ?? 50);
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new Error("Use offset >= 0 and limit 1–100");
  return {
    items: values.slice(offset, offset + limit),
    total: values.length,
    nextOffset: offset + limit < values.length ? offset + limit : null,
  };
}
export function reviewTools(c: ReviewController): Tool[] {
  const tool = (
    name: string,
    description: string,
    fields: Args,
    execute: (a: Args) => unknown,
    required: string[] = [],
  ): Tool => ({
    name,
    description,
    inputSchema: {
      type: "object",
      properties: fields,
      required,
      additionalProperties: false,
    },
    execute: async (a) => {
      try {
        return {
          content: [{ type: "text", text: JSON.stringify(await execute(a)) }],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
        };
      }
    },
  });
  const pagination = {
    offset: number,
    limit: { type: "integer", minimum: 1, maximum: 100 },
  };
  return [
    tool(
      "get-view-state",
      "Read the current IFC model, selection, camera, clipping, visibility, colors, and review draft.",
      {},
      () => ({
        model: c.name,
        elementCount: c.rows.length,
        ...c.capture(),
        draft: c.state.draft,
      }),
    ),
    tool(
      "browse-hierarchy",
      "Browse IFC spatial hierarchy. Omit parentId for project root. Search optionally filters rendered elements.",
      { parentId: number, search: string, ...pagination },
      (a) => {
        c.requireModel();
        if (typeof a.search === "string")
          return page(
            c.rows.filter((r) =>
              `${r.name} ${r.type}`
                .toLowerCase()
                .includes((a.search as string).toLowerCase()),
            ),
            a,
          );
        const root = c.store?.spatialHierarchy?.project;
        if (!root) return page(c.rows, a);
        if (a.parentId === undefined)
          return page(
            [{ id: root.expressId, name: root.name, hasChildren: true }],
            a,
          );
        const find = (node: typeof root): typeof root | undefined =>
          node.expressId === a.parentId
            ? node
            : node.children.map(find).find(Boolean);
        const node = find(root);
        if (!node) throw new Error("Spatial node not found");
        return page(
          [
            ...node.children.map((n) => ({
              id: n.expressId,
              name: n.name,
              hasChildren: true,
            })),
            ...c.rows.filter((r) => node.elements.includes(r.id)),
          ],
          a,
        );
      },
    ),
    tool(
      "get-properties",
      "Read paginated properties for rendered IFC elements. Omit ids to browse the entire rendered model.",
      { ids, ...pagination },
      (a) =>
        (() => {
          c.requireModel();
          const result = page(
            a.ids === undefined
              ? c.rows.map((r) => r.id)
              : c.ids(elementIds(a)),
            a,
          );
          return { ...result, items: c.detail(result.items) };
        })(),
    ),
    tool(
      "measure-elements",
      "Approximate world-axis bounding-box dimensions in metres. Y is height. Not exact surface measurements.",
      { ids },
      (a) => c.measure(elementIds(a)),
      ["ids"],
    ),
    tool(
      "set-view-state",
      "Change visibility, selected element, section or standard camera view in the live IFC scene.",
      {
        action: { type: "string", enum: ["isolate", "hide", "show", "reset"] },
        ids,
        selectedId: number,
        view: {
          type: "string",
          enum: ["top", "bottom", "front", "back", "left", "right", "fit"],
        },
        section: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            axis: { type: "string", enum: ["x", "y", "z"] },
            position: { type: "number", minimum: 0, maximum: 100 },
            flipped: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
      (a) => {
        c.requireModel();
        if (a.action)
          c.visibility(text(a, "action"), a.ids ? elementIds(a) : []);
        if (a.selectedId !== undefined) {
          c.ids([Number(a.selectedId)]);
          c.select(Number(a.selectedId));
        }
        if (a.section) {
          const s = a.section as Parameters<typeof c.section>[0];
          c.section(s);
        }
        if (a.view) {
          const v = text(a, "view");
          if (v === "fit") c.orbitView();
          else if (
            ["top", "bottom", "front", "back", "left", "right"].includes(v)
          )
            c.presetView(v as "top");
          else throw new Error("Unknown camera view");
        }
        return c.capture();
      },
    ),
    tool(
      "set-theming-color",
      "Color rendered IFC elements with labeled #RRGGBB groups. Empty groups clears colors.",
      {
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: { label: string, color: string, ids },
            required: ["label", "color", "ids"],
            additionalProperties: false,
          },
        },
      },
      (a) => {
        if (!Array.isArray(a.groups))
          throw new Error("groups must be an array");
        c.color(a.groups as ColorGroup[]);
        return c.state.colors;
      },
      ["groups"],
    ),
    tool(
      "list-issues",
      "List locally saved review issues for the loaded model.",
      { ...pagination },
      (a) =>
        page(
          c.state.issues.map(({ viewpoint, ...issue }) => ({
            ...issue,
            selectedId: viewpoint.selected,
          })),
          a,
        ),
    ),
    tool(
      "show-issue",
      "Restore camera, selection, section, visibility and colors for a saved issue.",
      { id: string },
      (a) => c.show(text(a, "id")),
      ["id"],
    ),
    tool(
      "draft-issue",
      "Open or update the visible issue draft. Does not save. Omitted fields retain their values.",
      {
        title: string,
        description: string,
        severity: { type: "string", enum: ["low", "medium", "high"] },
        assignedTo: string,
      },
      (a) => {
        const patch: Record<string, string> = {};
        for (const key of ["title", "description", "severity", "assignedTo"])
          if (a[key] !== undefined) patch[key] = text(a, key);
        return c.draft(patch);
      },
    ),
    tool(
      "submit-issue",
      "Save the current reviewed draft to this browser only. Invoke only when the user explicitly asks to save or submit it.",
      {},
      () => c.submit(),
    ),
  ];
}
export async function registerReviewTools(
  c: ReviewController,
  onStatus: (status: string) => void,
  abort: AbortController,
) {
  const context =
    (document as Document & { modelContext?: Context }).modelContext ??
    (navigator as Navigator & { modelContext?: Context }).modelContext;
  if (!context) {
    onStatus("Local tools");
    return () => {};
  }
  const names: string[] = [];
  try {
    for (const tool of reviewTools(c)) {
      if (abort.signal.aborted) return () => {};
      await context.registerTool(tool, { signal: abort.signal });
      names.push(tool.name);
    }
    if (!abort.signal.aborted) onStatus("AI tools ready");
  } catch {
    onStatus("Local tools");
    abort.abort();
    for (const name of names) context.unregisterTool?.(name);
  }
  return () => {
    abort.abort();
    for (const name of names) context.unregisterTool?.(name);
  };
}
