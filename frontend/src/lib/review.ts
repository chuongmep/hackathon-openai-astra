import type { Renderer } from "@ifc-lite/renderer";
import type { IfcDataStore } from "@ifc-lite/parser";
import { properties, type ModelRow } from "./model";
export type SceneOptions = NonNullable<Parameters<Renderer["render"]>[0]>;
export type Section = {
  enabled: boolean;
  axis: "x" | "y" | "z";
  position: number;
  flipped: boolean;
};
export type Viewpoint = {
  selected: number | null;
  isolated: number[] | null;
  hidden: number[];
  section: Section;
  colors: ColorGroup[];
  camera?: {
    up?: { x: number; y: number; z: number };
    eye: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
};
export type ColorGroup = { label: string; color: string; ids: number[] };
export type Issue = {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  assignedTo: string;
  viewpoint: Viewpoint;
  createdAt: string;
};
export type Draft = Pick<
  Issue,
  "title" | "description" | "severity" | "assignedTo"
> & { viewpoint?: Viewpoint };
const emptySection = (): Section => ({
  enabled: false,
  axis: "y",
  position: 50,
  flipped: false,
});
export class ReviewController {
  renderer?: Renderer;
  store?: IfcDataStore;
  rows: ModelRow[] = [];
  modelKey = "";
  name = "";
  focusScene: () => void = () => {};
  select: (id: number | null) => void = () => {};
  state = {
    selected: null as number | null,
    isolated: null as number[] | null,
    hidden: [] as number[],
    section: emptySection(),
    colors: [] as ColorGroup[],
    mode: "orbit" as "orbit" | "pan" | "walk",
    open: false,
    measurement: "",
    error: "",
    issues: [] as Issue[],
    draft: null as Draft | null,
  };
  listeners = new Set<() => void>();
  constructor(public options: { current: SceneOptions }) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  update(patch: Partial<typeof this.state>) {
    if (patch.mode && patch.mode !== this.state.mode) {
      this.renderer?.getCamera().reset();
      const camera = this.renderer?.getCamera();
      camera?.setInteractionMode("all");
      camera?.enableFirstPersonMode(patch.mode === "walk");
      if (patch.mode === "walk" && camera) {
        const eye = camera.getPosition(),
          target = camera.getTarget();
        const dx = target.x - eye.x,
          dz = target.z - eye.z;
        if (Math.hypot(dx, dz) < 0.01)
          camera.setTarget(eye.x, eye.y, eye.z - 1);
        camera.setUp(0, 1, 0);
        this.focusScene();
      }
    }
    this.state = { ...this.state, ...patch };
    this.apply();
    this.listeners.forEach((fn) => fn());
  }
  orbitView() {
    this.update({ mode: "orbit" });
    const camera = this.renderer?.getCamera();
    camera?.reset();
    camera?.enableFirstPersonMode(false);
    camera?.setInteractionMode("all");
    camera?.setUp(0, 1, 0);
    this.renderer?.fitToView();
  }
  zoom(delta: number) {
    const camera = this.renderer?.getCamera();
    camera?.reset();
    camera?.setInteractionMode("all");
    camera?.zoom(delta);
    this.renderer?.requestRender();
  }
  presetView(view: "top" | "bottom" | "front" | "back" | "left" | "right") {
    this.update({ mode: "orbit" });
    const camera = this.renderer?.getCamera();
    camera?.reset();
    camera?.enableFirstPersonMode(false);
    camera?.setInteractionMode("all");
    camera?.setPresetView(view, this.renderer?.getModelBounds() ?? undefined);
    this.renderer?.requestRender();
  }
  load(key: string, name: string, store: IfcDataStore, rows: ModelRow[]) {
    this.modelKey = key;
    this.name = name;
    this.store = store;
    this.rows = rows;
    let issues: Issue[] = [];
    let error = "";
    try {
      const value = JSON.parse(
        localStorage.getItem("forma-review:" + key) || "[]",
      );
      if (Array.isArray(value))
        issues = value.filter(
          (i) =>
            i &&
            typeof i.id === "string" &&
            i.viewpoint &&
            typeof i.title === "string",
        );
    } catch {
      error =
        "Saved reviews could not be read. New reviews can still be created.";
    }
    this.update({
      selected: null,
      isolated: null,
      hidden: [],
      section: emptySection(),
      colors: [],
      draft: null,
      issues,
      measurement: "",
      error,
    });
  }
  apply() {
    const { isolated, hidden, section } = this.state;
    const bounds = this.renderer?.getModelBounds();
    this.options.current = {
      hiddenIds: new Set(hidden),
      isolatedIds: isolated === null ? null : new Set(isolated),
      sectionPlane:
        section.enabled && bounds
          ? {
              enabled: true,
              axis: "down",
              position: section.position / 100,
              normal:
                section.axis === "x"
                  ? [1, 0, 0]
                  : section.axis === "y"
                    ? [0, 1, 0]
                    : [0, 0, 1],
              distance:
                bounds.min[section.axis] +
                ((bounds.max[section.axis] - bounds.min[section.axis]) *
                  section.position) /
                  100,
              flipped: section.flipped,
              showCap: true,
              showOutlines: true,
            }
          : undefined,
    };
    this.renderer?.requestRender();
  }
  requireModel() {
    if (!this.rows.length) throw new Error("Open an IFC model first.");
  }
  ids(ids: number[]) {
    this.requireModel();
    if (
      !ids.length ||
      ids.some(
        (id) => !Number.isInteger(id) || !this.rows.some((r) => r.id === id),
      )
    )
      throw new Error("Choose valid rendered element IDs from this model.");
    return ids;
  }
  capture(): Viewpoint {
    const camera = this.renderer?.getCamera();
    return structuredClone({
      selected: this.state.selected,
      isolated: this.state.isolated,
      hidden: this.state.hidden,
      section: this.state.section,
      colors: this.state.colors,
      camera: camera
        ? {
            eye: camera.getPosition(),
            target: camera.getTarget(),
            up: camera.getUp(),
          }
        : undefined,
    });
  }
  restore(view: Viewpoint) {
    this.update({
      mode: "orbit",
      selected: view.selected,
      isolated: view.isolated,
      hidden: view.hidden,
      section: view.section,
    });
    this.select(view.selected);
    this.color(view.colors);
    const c = view.camera;
    if (c) {
      this.renderer?.getCamera().reset();
      if (c.up) this.renderer?.getCamera().setUp(c.up.x, c.up.y, c.up.z);
      this.renderer?.getCamera().setPosition(c.eye.x, c.eye.y, c.eye.z);
      this.renderer?.getCamera().setTarget(c.target.x, c.target.y, c.target.z);
    }
    this.renderer?.requestRender();
  }
  visibility(action: string, ids: number[] = []) {
    if (action === "reset") {
      this.update({ isolated: null, hidden: [] });
      return;
    }
    this.ids(ids);
    if (action === "isolate")
      this.update({
        isolated: ids,
        hidden: this.state.hidden.filter((id) => !ids.includes(id)),
      });
    else if (action === "hide")
      this.update({ hidden: [...new Set([...this.state.hidden, ...ids])] });
    else if (action === "show")
      this.update({
        hidden: this.state.hidden.filter((id) => !ids.includes(id)),
        isolated:
          this.state.isolated === null
            ? null
            : [...new Set([...this.state.isolated, ...ids])],
      });
    else throw new Error("Unknown visibility action");
  }
  section(patch: Partial<Section>) {
    const value = { ...this.state.section, ...patch };
    if (
      !["x", "y", "z"].includes(value.axis) ||
      !Number.isFinite(value.position) ||
      value.position < 0 ||
      value.position > 100
    )
      throw new Error("Section position must be 0–100 on X, Y or Z.");
    this.update({ section: value });
  }
  reset() {
    this.update({
      mode: "orbit",
      isolated: null,
      hidden: [],
      section: emptySection(),
      measurement: "",
    });
    this.color([]);
    this.renderer?.fitToView();
  }
  measure(ids: number[]) {
    this.ids(ids);
    const boxes = ids.map((id) => {
      const b = this.renderer?.getScene().getEntityBoundingBox(id);
      if (!b) throw new Error(`No geometry bounds for #${id}`);
      return {
        id,
        bounds: b,
        dimensions: {
          x: b.max.x - b.min.x,
          y: b.max.y - b.min.y,
          z: b.max.z - b.min.z,
        },
      };
    });
    const result = {
      approximate: true,
      units: "metres",
      method:
        "World axis-aligned bounding boxes, not exact surface measurements",
      elements: boxes,
    };
    this.update({
      measurement: boxes
        .map(
          (b) =>
            `#${b.id} · ${b.dimensions.x.toFixed(2)} × ${b.dimensions.y.toFixed(2)} × ${b.dimensions.z.toFixed(2)} m (X / Y / Z)`,
        )
        .join("\n"),
    });
    return result;
  }
  color(groups: ColorGroup[]) {
    for (const g of groups) {
      this.ids(g.ids);
      if (!/^#[0-9a-f]{6}$/i.test(g.color))
        throw new Error("Colors must use #RRGGBB.");
    }
    const renderer = this.renderer,
      device = renderer?.getGPUDevice(),
      pipeline = renderer?.getPipeline();
    if (groups.length && (!device || !pipeline))
      throw new Error("Renderer is not ready.");
    if (device && pipeline && renderer) {
      const map = new Map<number, [number, number, number, number]>();
      for (const g of groups)
        for (const id of g.ids)
          map.set(id, [
            parseInt(g.color.slice(1, 3), 16) / 255,
            parseInt(g.color.slice(3, 5), 16) / 255,
            parseInt(g.color.slice(5, 7), 16) / 255,
            1,
          ]);
      renderer.getScene().setColorOverrides(map, device, pipeline);
    }
    this.update({ colors: groups });
  }
  colorByType() {
    const palette = [
      "#147d73",
      "#ba7343",
      "#677dc1",
      "#9c6289",
      "#789347",
      "#ba5454",
    ];
    this.color(
      [...new Set(this.rows.map((r) => r.type))].map((type, i) => ({
        label: type,
        color: palette[i % palette.length],
        ids: this.rows.filter((r) => r.type === type).map((r) => r.id),
      })),
    );
  }
  draft(patch: Partial<Draft> = {}) {
    this.requireModel();
    if (patch.severity && !["low", "medium", "high"].includes(patch.severity))
      throw new Error("Invalid severity");
    this.update({
      open: true,
      draft: {
        title: "",
        description: "",
        severity: "medium",
        assignedTo: "",
        ...this.state.draft,
        ...patch,
        viewpoint: this.state.draft?.viewpoint ?? this.capture(),
      },
    });
    return this.state.draft;
  }
  submit() {
    const d = this.state.draft;
    if (!d?.title.trim()) throw new Error("Add an issue title before saving.");
    const issue: Issue = {
      ...d,
      viewpoint: d.viewpoint ?? this.capture(),
      id: `ISS-${this.state.issues.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    const issues = [...this.state.issues, issue];
    localStorage.setItem(
      "forma-review:" + this.modelKey,
      JSON.stringify(issues),
    );
    this.update({ issues, draft: null, error: "" });
    return issue;
  }
  show(id: string) {
    const issue = this.state.issues.find((i) => i.id === id);
    if (!issue) throw new Error("Issue not found in this model.");
    this.restore(issue.viewpoint);
    this.update({ open: true });
    return issue;
  }
  detail(ids: number[]) {
    return this.ids(ids).map((id) => ({
      ...this.rows.find((r) => r.id === id),
      propertySets: this.store ? properties(this.store, id) : [],
    }));
  }
  async command(text: string): Promise<string | null> {
    const t = text.trim().toLowerCase();
    const selected = this.state.selected;
    const ids = selected === null ? [] : [selected];
    if (/^isolate (the )?selected( element)?[.!]?$/.test(t)) {
      this.visibility("isolate", ids);
      return "Isolated the selected element.";
    }
    if (/^hide (the )?selected( element)?[.!]?$/.test(t)) {
      this.visibility("hide", ids);
      return "Hidden the selected element. Use Reset view to restore it.";
    }
    if (/^show all( elements)?[.!]?$/.test(t)) {
      this.visibility("reset");
      return "All elements are visible.";
    }
    if (/^measure (the )?selected( element)?[.!]?$/.test(t)) {
      this.measure(ids);
      return this.state.measurement + "\nApproximate bounding-box dimensions.";
    }
    if (/^colou?r( code)? by (ifc )?type[.!]?$/.test(t)) {
      this.requireModel();
      this.colorByType();
      return "Colored the model by IFC class. The scene legend identifies each group.";
    }
    if (/^draft( an?)? issue[.!]?$/.test(t)) {
      this.draft({
        title:
          selected === null ? "Model review" : `Review element #${selected}`,
      });
      return "Issue draft opened with the current viewpoint. Review it and save when ready.";
    }
    if (/^show iss-\d+$/i.test(t)) {
      this.show(t.toUpperCase().replace("SHOW ", ""));
      return "Restored the saved issue viewpoint.";
    }
    if (/^reset view[.!]?$/.test(t)) {
      this.reset();
      return "Reset the camera, visibility, section and colors.";
    }
    return null;
  }
}
