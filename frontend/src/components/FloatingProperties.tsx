import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react";
import { GripHorizontal, X, Grip } from "lucide-react";
type Rect = { x: number; y: number; width: number; height: number };
export function FloatingProperties({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  function constrain(r: Rect): Rect {
    const parent = ref.current?.parentElement;
    if (!parent) return r;
    const w = parent.clientWidth,
      h = parent.clientHeight;
    const width = Math.max(120, Math.min(r.width, w - 16)),
      height = Math.max(100, Math.min(r.height, h - 16));
    return {
      width,
      height,
      x: Math.max(8, Math.min(r.x, w - width - 8)),
      y: Math.max(8, Math.min(r.y, h - height - 8)),
    };
  }
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() =>
      setRect((old) =>
        constrain(
          old ?? {
            x: parent.clientWidth - 336,
            y: 72,
            width: 320,
            height: Math.min(460, parent.clientHeight - 100),
          },
        ),
      ),
    );
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  function drag(e: PointerEvent, resize = false) {
    if ((e.target as HTMLElement).closest("button") && !resize) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = rect;
    if (!start) return;
    const x = e.clientX,
      y = e.clientY;
    const move = (event: Event) => {
      const p = event as globalThis.PointerEvent;
      setRect(
        constrain(
          resize
            ? {
                ...start,
                width: Math.max(240, start.width + p.clientX - x),
                height: Math.max(200, start.height + p.clientY - y),
              }
            : {
                ...start,
                x: start.x + p.clientX - x,
                y: start.y + p.clientY - y,
              },
        ),
      );
    };
    const stop = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("pointercancel", stop);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
  }
  return (
    <aside
      ref={ref}
      className="scene-properties floating-properties"
      aria-label="Element properties"
      style={
        rect
          ? {
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
    >
      <div
        className="scene-properties-heading property-drag-handle"
        onPointerDown={(e) => drag(e)}
      >
        <span
          tabIndex={0}
          role="button"
          aria-label="Move properties panel"
          onKeyDown={(e) => {
            if (!rect || !e.key.startsWith("Arrow")) return;
            e.preventDefault();
            setRect(
              constrain({
                ...rect,
                x:
                  rect.x +
                  (e.key === "ArrowRight"
                    ? 10
                    : e.key === "ArrowLeft"
                      ? -10
                      : 0),
                y:
                  rect.y +
                  (e.key === "ArrowDown" ? 10 : e.key === "ArrowUp" ? -10 : 0),
              }),
            );
          }}
        >
          <GripHorizontal size={15} /> Element properties
        </span>
        <button aria-label="Close properties" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {children}
      <button
        className="property-resize-handle"
        aria-label="Resize properties panel"
        title="Drag to resize"
        onPointerDown={(e) => drag(e, true)}
        onKeyDown={(e) => {
          if (!rect || !e.key.startsWith("Arrow")) return;
          e.preventDefault();
          setRect(
            constrain({
              ...rect,
              width: Math.max(
                240,
                rect.width +
                  (e.key === "ArrowRight"
                    ? 10
                    : e.key === "ArrowLeft"
                      ? -10
                      : 0),
              ),
              height: Math.max(
                200,
                rect.height +
                  (e.key === "ArrowDown" ? 10 : e.key === "ArrowUp" ? -10 : 0),
              ),
            }),
          );
        }}
      >
        <Grip size={14} />
      </button>
    </aside>
  );
}
