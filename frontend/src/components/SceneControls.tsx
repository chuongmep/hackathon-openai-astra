import { ViewCube } from "./ViewCube";
import { useSyncExternalStore } from "react";
import {
  Footprints,
  Orbit,
  Hand,
  Ruler,
  Palette,
  ClipboardList,
  EyeOff,
  Focus,
  Minus,
  Plus,
  RotateCcw,
  Scissors,
  FlipVertical2,
} from "lucide-react";
import { ReviewController, type SceneOptions } from "../lib/review";
export type { SceneOptions };
export function SceneControls({
  controller: c,
  loaded,
}: {
  controller: ReviewController;
  loaded: boolean;
}) {
  const state = useSyncExternalStore(c.subscribe, c.snapshot);
  const renderer = c.renderer,
    selected = state.selected,
    isolated = state.isolated;
  const { enabled: cut, axis, position, flipped } = state.section;
  const setAxis = (axis: "x" | "y" | "z") => c.section({ axis });
  const setPosition = (position: number) => c.section({ position });
  const setFlipped = (_: unknown) => c.section({ flipped: !flipped });
  const setCut = (_: unknown) => c.section({ enabled: !cut });
  function run(fn: () => void) {
    try {
      fn();
    } catch (e) {
      c.update({ error: String(e), open: true });
    }
  }
  return (
    <>
      {state.mode === "walk" && (
        <div className="walk-help">
          Walkthrough · Click scene, then WASD / arrows to move · Q / E down /
          up · Drag to look{" "}
          <button onClick={() => c.update({ mode: "orbit" })}>Exit</button>
        </div>
      )}
      <ViewCube controller={c} loaded={loaded} />
      {state.colors.length > 0 && (
        <div className="scene-legend" aria-label="Color legend">
          {state.colors.map((g) => (
            <div key={g.label}>
              <i style={{ background: g.color }} />
              {g.label} <small>{g.ids.length}</small>
            </div>
          ))}
        </div>
      )}
      <div className="scene-tool-dock">
        {state.measurement && (
          <div className="measurement-result" role="status">
            <span>
              {state.measurement}
              <small>Approximate bounding box</small>
            </span>
            <button
              aria-label="Close measurement"
              onClick={() => c.update({ measurement: "" })}
            >
              ×
            </button>
          </div>
        )}
        {cut && (
          <div className="section-settings">
            <label>
              Cut axis{" "}
              <select
                aria-label="Section cut axis"
                value={axis}
                onChange={(e) => setAxis(e.target.value as typeof axis)}
              >
                <option value="x">X</option>
                <option value="y">Y · height</option>
                <option value="z">Z</option>
              </select>
            </label>
            <input
              aria-label="Section cut position"
              type="range"
              min="0"
              max="100"
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
            />
            <output>{position}%</output>
            <button
              title="Flip cut direction"
              aria-label="Flip cut direction"
              aria-pressed={flipped}
              onClick={() => setFlipped(null)}
            >
              <FlipVertical2 size={16} />
            </button>
          </div>
        )}
        <div
          className="scene-toolbar"
          role="toolbar"
          aria-label="Model navigation tools"
        >
          <button
            disabled={!loaded}
            title="Orbit"
            aria-label="Orbit navigation"
            aria-pressed={state.mode === "orbit"}
            onClick={() => c.update({ mode: "orbit" })}
          >
            <Orbit size={18} />
          </button>
          <button
            disabled={!loaded}
            title="Pan"
            aria-label="Pan navigation"
            aria-pressed={state.mode === "pan"}
            onClick={() => c.update({ mode: "pan" })}
          >
            <Hand size={18} />
          </button>
          <button
            disabled={!loaded}
            title="Walkthrough"
            aria-label="Walkthrough"
            aria-pressed={state.mode === "walk"}
            onClick={() =>
              c.update({ mode: state.mode === "walk" ? "orbit" : "walk" })
            }
          >
            <Footprints size={18} />
          </button>
          <span className="tool-divider" />
          <button
            disabled={!loaded}
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => c.zoom(180)}
          >
            <Minus size={18} />
          </button>
          <button
            disabled={!loaded}
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => c.zoom(-180)}
          >
            <Plus size={18} />
          </button>
          <span className="tool-divider" />
          <button
            disabled={!loaded || (selected === null && isolated === null)}
            title={
              isolated !== null
                ? "Show all elements"
                : "Isolate selected element"
            }
            aria-label={
              isolated !== null
                ? "Show all elements"
                : "Isolate selected element"
            }
            aria-pressed={isolated !== null}
            onClick={() =>
              c.visibility(
                isolated !== null ? "reset" : "isolate",
                selected === null ? [] : [selected],
              )
            }
          >
            <Focus size={18} />
            <span>{isolated !== null ? "Show all" : "Isolate"}</span>
          </button>
          <button
            disabled={!loaded}
            title="Toggle section cut"
            aria-label="Section cut"
            aria-pressed={cut}
            onClick={() => setCut(null)}
          >
            <Scissors size={18} />
            <span>Section</span>
          </button>
          <button
            disabled={!loaded || selected === null}
            title="Hide selected element"
            aria-label="Hide selected element"
            onClick={() => c.visibility("hide", [selected!])}
          >
            <EyeOff size={18} />
          </button>
          <span className="tool-divider" />
          <button
            disabled={!loaded || selected === null}
            title="Measure selected element"
            aria-label="Measure selected element"
            onClick={() =>
              run(() => {
                c.measure([selected!]);
              })
            }
          >
            <Ruler size={18} />
          </button>
          <button
            disabled={!loaded}
            title="Color by IFC type"
            aria-label="Color by IFC type"
            aria-pressed={state.colors.length > 0}
            onClick={() =>
              run(() => (state.colors.length ? c.color([]) : c.colorByType()))
            }
          >
            <Palette size={18} />
          </button>
          <button
            title="Design review"
            aria-label="Design review"
            aria-pressed={state.open}
            onClick={() => c.update({ open: !state.open })}
          >
            <ClipboardList size={18} />
          </button>
          <span className="tool-divider" />
          <button
            disabled={!loaded}
            title="Reset view and show all elements"
            aria-label="Reset view"
            onClick={() => {
              c.reset();
            }}
          >
            <RotateCcw size={17} />
          </button>
        </div>
      </div>
    </>
  );
}
