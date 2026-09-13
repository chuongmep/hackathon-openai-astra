import { test, expect } from "bun:test";
import { ReviewController } from "../src/lib/review";
import { reviewTools } from "../src/lib/webmcp";
function controller() {
  const c = new ReviewController({ current: {} });
  c.rows = [
    { id: 1, name: "Wall", type: "IfcWall", globalId: "a", level: "L1" },
    { id: 2, name: "Roof", type: "IfcRoof", globalId: "b", level: "L2" },
  ];
  return c;
}
test("visibility rejects unknown IDs and retains explicit empty isolation semantics", () => {
  const c = controller();
  c.visibility("isolate", [1]);
  c.visibility("hide", [1]);
  expect([...c.options.current.hiddenIds!]).toEqual([1]);
  c.visibility("show", [1]);
  expect(c.state.hidden).toEqual([]);
  expect(() => c.visibility("hide", [999])).toThrow();
  c.visibility("reset");
  expect(c.options.current.isolatedIds).toBeNull();
});
test("draft edits retain the captured viewpoint and require title", () => {
  const c = controller();
  c.update({ selected: 1 });
  c.draft();
  c.update({ selected: 2 });
  c.draft({ severity: "high" });
  expect(c.state.draft?.viewpoint?.selected).toBe(1);
  expect(() => c.submit()).toThrow("title");
});
test("section rejects invalid coordinates without changing scene", () => {
  const c = controller();
  expect(() => c.section({ position: NaN })).toThrow();
  expect(() => c.section({ position: 101 })).toThrow();
  expect(c.state.section.enabled).toBe(false);
});
test("tool errors are structured and property results paginate", async () => {
  const c = controller();
  const tools = reviewTools(c);
  expect(tools.length).toBe(10);
  const result = await tools
    .find((t) => t.name === "set-view-state")!
    .execute({ action: "hide", ids: [999] });
  expect(result.isError).toBe(true);
  const data = await tools
    .find((t) => t.name === "get-properties")!
    .execute({ limit: 1 });
  expect(JSON.parse(data.content[0].text).nextOffset).toBe(1);
});
test("local commands never interpret an issue drafting request as submission", async () => {
  const c = controller();
  await c.command("Draft an issue");
  expect(c.state.draft).not.toBeNull();
  expect(c.state.issues).toHaveLength(0);
  expect(await c.command("do not hide selected")).toBeNull();
});

test("view cube restores orbit mode after walking or panning", () => {
  const c = controller();
  const calls: string[] = [];
  const camera = {
    reset: () => calls.push("reset"),
    enableFirstPersonMode: (v: boolean) => calls.push(`walk:${v}`),
    setInteractionMode: (v: string) => calls.push(v),
    setUp: () => {},
    getPosition: () => ({ x: 0, y: 2, z: 10 }),
    getTarget: () => ({ x: 0, y: 2, z: 0 }),
    setPresetView: (v: string) => calls.push(v),
  };
  c.renderer = {
    getCamera: () => camera,
    fitToView: () => calls.push("fit"),
    getModelBounds: () => null,
    requestRender: () => {},
  } as unknown as NonNullable<typeof c.renderer>;
  c.update({ mode: "walk" });
  c.orbitView();
  expect(c.state.mode).toBe("orbit");
  expect(calls).toContain("walk:false");
  expect(calls.at(-1)).toBe("fit");
  c.update({ mode: "pan" });
  c.presetView("top");
  expect(c.state.mode).toBe("orbit");
  expect(calls.at(-1)).toBe("top");
});

test("AI highlights share scene state with review isolation and reset", () => {
  const c = controller();
  c.update({ highlighted: [1, 2] });
  c.visibility("isolate", [1]);
  c.section({ enabled: true, position: 25 });
  expect([...c.options.current.selectedIds!]).toEqual([1, 2]);
  expect([...c.options.current.isolatedIds!]).toEqual([1]);
  c.reset();
  expect([...c.options.current.selectedIds!]).toEqual([]);
  expect(c.options.current.isolatedIds).toBeNull();
});
