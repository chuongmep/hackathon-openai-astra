import { useEffect, useRef, useState } from "react";
import { Home, ChevronDown } from "lucide-react";
import type { ReviewController } from "../lib/review";
type V = [number, number, number];
const dot = (a: V, b: V) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V): V => {
  const l = Math.hypot(...a) || 1;
  return a.map((n) => n / l) as V;
};
const faces: { name: string; normal: V; u: V; v: V; fill: string }[] = [
  {
    name: "Front",
    normal: [0, 0, 1],
    u: [1, 0, 0],
    v: [0, -1, 0],
    fill: "#e5e9e7",
  },
  {
    name: "Right",
    normal: [1, 0, 0],
    u: [0, 0, -1],
    v: [0, -1, 0],
    fill: "#d6dcda",
  },
  {
    name: "Back",
    normal: [0, 0, -1],
    u: [-1, 0, 0],
    v: [0, -1, 0],
    fill: "#e5e9e7",
  },
  {
    name: "Left",
    normal: [-1, 0, 0],
    u: [0, 0, 1],
    v: [0, -1, 0],
    fill: "#d6dcda",
  },
  {
    name: "Top",
    normal: [0, 1, 0],
    u: [1, 0, 0],
    v: [0, 0, 1],
    fill: "#f7f9f8",
  },
  {
    name: "Bottom",
    normal: [0, -1, 0],
    u: [1, 0, 0],
    v: [0, 0, -1],
    fill: "#e5e9e7",
  },
];
export function cubeBasis(direction: V, up: V) {
  const z = unit(direction);
  let x = unit(cross(up, z));
  if (Math.hypot(...x) < 0.01) x = [1, 0, 0];
  return { x, y: unit(cross(z, x)), z };
}
export function ViewCube({
  controller: c,
  loaded,
}: {
  controller: ReviewController;
  loaded: boolean;
}) {
  const [pose, setPose] = useState({
    direction: [1, 1, 2] as V,
    up: [0, 1, 0] as V,
  });
  const drag = useRef<{
    x: number;
    y: number;
    active: boolean;
    moved: boolean;
  }>({ x: 0, y: 0, active: false, moved: false });
  useEffect(() => {
    let frame = 0,
      last = "";
    const tick = () => {
      const camera = c.renderer?.getCamera();
      if (camera) {
        const e = camera.getPosition(),
          t = camera.getTarget(),
          u = camera.getUp();
        const direction = unit([e.x - t.x, e.y - t.y, e.z - t.z]),
          up: V = [u.x, u.y, u.z];
        const key = [...direction, ...up].map((n) => n.toFixed(4)).join(",");
        if (key !== last) {
          last = key;
          setPose({ direction, up });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [c]);
  const basis = cubeBasis(pose.direction, pose.up);
  const project = (p: V) => [
    90 + dot(p, basis.x) * 31,
    78 - dot(p, basis.y) * 31,
  ];
  const point = (n: V, u: V, v: V, a: number, b: number): V =>
    n.map((x, i) => x + u[i] * a + v[i] * b) as V;
  const visible = faces.filter((f) => dot(f.normal, basis.z) > 0.015);
  function snap(direction: V) {
    if (!loaded) return;
    const camera = c.renderer?.getCamera();
    if (!camera) return;
    c.update({ mode: "orbit" });
    camera.reset();
    camera.enableFirstPersonMode(false);
    camera.setInteractionMode("orbit");
    const eye = camera.getPosition(),
      target = camera.getTarget(),
      distance = Math.max(
        1,
        Math.hypot(eye.x - target.x, eye.y - target.y, eye.z - target.z),
      ),
      d = unit(direction);
    void camera.animateToWithUp(
      {
        x: target.x + d[0] * distance,
        y: target.y + d[1] * distance,
        z: target.z + d[2] * distance,
      },
      target,
      Math.abs(d[1]) > 0.99
        ? { x: 0, y: 0, z: d[1] > 0 ? -1 : 1 }
        : { x: 0, y: 1, z: 0 },
      220,
    );
    c.renderer?.requestRender();
  }
  const label = (v: V) =>
    [
      v[1] > 0 ? "Top" : v[1] < 0 ? "Bottom" : "",
      v[2] > 0 ? "front" : v[2] < 0 ? "back" : "",
      v[0] > 0 ? "right" : v[0] < 0 ? "left" : "",
    ]
      .filter(Boolean)
      .join(" ");
  const corners: V[] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x, y, z]);
  const edges: { a: V; b: V; direction: V }[] = [];
  for (let i = 0; i < corners.length; i++)
    for (let j = i + 1; j < corners.length; j++) {
      const a = corners[i],
        b = corners[j];
      if (a.filter((v, k) => v !== b[k]).length === 1) {
        const direction = a.map((v, k) => (v + b[k]) / 2) as V;
        if (visible.some((f) => dot(direction, f.normal) > 0.5))
          edges.push({ a, b, direction });
      }
    }
  function activate(e: React.KeyboardEvent, d: V) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      snap(d);
    }
  }
  return (
    <div className="navigation-cube" aria-label="View orientation">
      <button
        className="cube-home"
        aria-label="Home view"
        title="Home / isometric view"
        disabled={!loaded}
        onClick={() => c.orbitView()}
      >
        <Home size={19} />
      </button>
      <svg
        viewBox="0 0 180 168"
        aria-label="Interactive 3D view cube"
        className={loaded ? "" : "cube-unavailable"}
        onPointerDown={(e) => {
          if (!loaded || e.button !== 0) return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            active: true,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d.active) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 4) return;
          if (!d.moved) {
            c.update({ mode: "orbit" });
            c.renderer?.getCamera().reset();
            c.renderer?.getCamera().setInteractionMode("orbit");
            e.currentTarget.setPointerCapture(e.pointerId);
            d.moved = true;
          }
          c.renderer?.getCamera().orbit(dx, dy);
          c.renderer?.requestRender();
          d.x = e.clientX;
          d.y = e.clientY;
        }}
        onPointerUp={() => {
          drag.current.active = false;
        }}
        onPointerCancel={() => {
          drag.current.active = false;
        }}
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.preventDefault();
            e.stopPropagation();
            drag.current.moved = false;
          }
        }}
      >
        <ellipse
          cx="90"
          cy="119"
          rx="76"
          ry="34"
          fill="#ffffff80"
          stroke="#b3beb8"
        />
        <ellipse
          cx="90"
          cy="119"
          rx="61"
          ry="24"
          fill="none"
          stroke="#b3beb8"
        />
        {(
          [
            { text: "N", d: [0, 0, -1] },
            { text: "E", d: [1, 0, 0] },
            { text: "S", d: [0, 0, 1] },
            { text: "W", d: [-1, 0, 0] },
          ] as { text: string; d: V }[]
        ).map(({ text, d }) => {
          const yaw = Math.atan2(basis.z[0], basis.z[2]),
            angle = Math.atan2(d[0], d[2]) - yaw;
          return (
            <g
              key={text}
              role="button"
              tabIndex={loaded ? 0 : -1}
              aria-label={`${text} model direction`}
              className="compass-point"
              transform={`translate(${90 + Math.sin(angle) * 69},${119 + Math.cos(angle) * 29})`}
              onClick={() => snap(d)}
              onKeyDown={(e) => activate(e, d)}
            >
              <title>Model axes · {text}</title>
              <circle r="10" />
              <text textAnchor="middle" dy="4">
                {text}
              </text>
            </g>
          );
        })}
        <ellipse
          cx="90"
          cy="121"
          rx="37"
          ry="12"
          fill="#26372f"
          opacity=".09"
        />
        {visible.map((f) => {
          const pts = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([a, b]) => project(point(f.normal, f.u, f.v, a, b)));
          const center = project(f.normal),
            u = project(point(f.normal, f.u, f.v, 1, 0)),
            v = project(point(f.normal, f.u, f.v, 0, 1));
          return (
            <g
              key={f.name}
              role="button"
              tabIndex={loaded ? 0 : -1}
              aria-label={`${f.name} view`}
              className="navigation-face"
              onClick={() => snap(f.normal)}
              onKeyDown={(e) => activate(e, f.normal)}
            >
              <title>{f.name} view</title>
              <polygon
                points={pts.map((p) => p.join(",")).join(" ")}
                fill={f.fill}
              />
              <text
                transform={`matrix(${(u[0] - center[0]) / 31} ${(u[1] - center[1]) / 31} ${(v[0] - center[0]) / 31} ${(v[1] - center[1]) / 31} ${center[0]} ${center[1]})`}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {f.name.toUpperCase()}
              </text>
            </g>
          );
        })}
        {edges.map(({ a, b, direction }, i) => {
          const p = project(a),
            q = project(b);
          return (
            <path
              key={i}
              role="button"
              tabIndex={-1}
              aria-label={`${label(direction)} edge view`}
              className="cube-edge-target"
              d={`M${p}L${q}`}
              onClick={() => snap(direction)}
            />
          );
        })}
        {corners
          .filter((p) => visible.some((f) => dot(p, f.normal) > 0.5))
          .map((p, i) => {
            const pos = project(p);
            return (
              <circle
                key={i}
                cx={pos[0]}
                cy={pos[1]}
                r="5"
                role="button"
                tabIndex={-1}
                aria-label={`${label(p)} corner view`}
                className="cube-corner-target"
                onClick={() => snap(p)}
              />
            );
          })}
      </svg>
      <label className="cube-menu">
        <ChevronDown size={14} />
        <select
          aria-label="Choose view direction"
          disabled={!loaded}
          value=""
          onChange={(e) => {
            const f = faces.find((f) => f.name === e.target.value);
            if (f) snap(f.normal);
            else if (e.target.value === "home") c.orbitView();
          }}
        >
          <option value="" disabled>
            Views
          </option>
          <option value="home">Home</option>
          {faces.map((f) => (
            <option key={f.name}>{f.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
