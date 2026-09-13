import { useRef, useSyncExternalStore } from "react";
import {
  Box,
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
type View = "top" | "front" | "right" | "back" | "left" | "bottom";
export function SceneControls({
  controller: c,
  loaded,
}: {
  controller: ReviewController;
  loaded: boolean;
}) {
  const cubeDrag = useRef({ x: 0, y: 0, moved: false });
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
  function preset(view: View) {
    c.presetView(view);
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
      <div className="orientation-control" aria-label="View orientation">
        <div
          className="view-cube"
          title="Click a face to align · drag to orbit"
          onPointerDown={(e) => {
            if (!loaded || e.button !== 0) return;
            cubeDrag.current = { x: e.clientX, y: e.clientY, moved: false };
          }}
          onPointerMove={(e) => {
            if (!loaded || !(e.buttons & 1)) return;
            const d = cubeDrag.current;
            const dx = e.clientX - d.x,
              dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) < 4) return;
            if (!d.moved) {
              c.update({ mode: "orbit" });
              renderer?.getCamera().reset();
              renderer?.getCamera().setInteractionMode("orbit");
              e.currentTarget.setPointerCapture(e.pointerId);
              d.moved = true;
            }
            renderer?.getCamera().orbit(dx, dy);
            renderer?.requestRender();
            d.x = e.clientX;
            d.y = e.clientY;
          }}
          onClickCapture={(e) => {
            if (cubeDrag.current.moved) {
              e.preventDefault();
              e.stopPropagation();
              cubeDrag.current.moved = false;
            }
          }}
        >
          <button
            className="cube-top"
            disabled={!loaded}
            onClick={() => preset("top")}
            title="Top view"
            aria-label="Top view"
          >
            TOP
          </button>
          <button
            className="cube-front"
            disabled={!loaded}
            onClick={() => preset("front")}
            title="Front view"
            aria-label="Front view"
          >
            FRONT
          </button>
          <button
            className="cube-right"
            disabled={!loaded}
            onClick={() => preset("right")}
            title="Right view"
            aria-label="Right view"
          >
            RIGHT
          </button>
        </div>
        <div className="orientation-actions">
          <button
            disabled={!loaded}
            title="Orbit / isometric view"
            aria-label="Orbit view"
            onClick={() => c.orbitView()}
          >
            <Box size={15} />
          </button>
          <select
            aria-label="Choose view direction"
            defaultValue=""
            disabled={!loaded}
            onChange={(e) => {
              if (e.target.value) preset(e.target.value as View);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Views
            </option>
            {(
              ["top", "front", "right", "back", "left", "bottom"] as View[]
            ).map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
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
            onClick={() => renderer?.getCamera().zoom(180)}
          >
            <Minus size={18} />
          </button>
          <button
            disabled={!loaded}
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => renderer?.getCamera().zoom(-180)}
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
