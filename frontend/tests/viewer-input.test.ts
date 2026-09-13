import { test, expect } from "bun:test";
import { Camera } from "@ifc-lite/renderer";
import { setupCameraControls } from "../src/lib/viewer";

test("real IFC camera responds to middle pan, wheel in every mode, and walk keys", () => {
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const set = (key: string, value: unknown) => {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  };
  const win = new EventTarget();
  const doc = { activeElement: null as unknown };
  let mode = "orbit";
  class Canvas extends EventTarget {
    style = { cursor: "" };
    clientHeight = 600;
    setPointerCapture() {}
    focus() {
      doc.activeElement = this;
    }
  }
  const canvas = new Canvas(),
    camera = new Camera();
  camera.setPosition(0, 2, 10);
  camera.setTarget(0, 2, 0);
  let requested = 0;
  const event = (target: EventTarget, type: string, fields: object) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, fields);
    target.dispatchEvent(e);
    return e;
  };
  let cleanup: () => void = () => {};
  try {
    set("window", win);
    set("document", doc);
    set("requestAnimationFrame", () => 1);
    set("cancelAnimationFrame", () => {});
    cleanup = setupCameraControls(
      canvas as unknown as HTMLCanvasElement,
      {
        getCamera: () => camera,
        requestRender: () => requested++,
      } as unknown as Parameters<typeof setupCameraControls>[1],
      () => mode,
    );
    for (mode of ["orbit", "pan", "walk"]) {
      camera.setInteractionMode("orbit");
      const before = camera.getPosition(),
        target = camera.getTarget();
      const down = event(canvas, "pointerdown", {
        button: 1,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        shiftKey: false,
      });
      event(canvas, "pointermove", { clientX: 160, clientY: 125 });
      event(canvas, "pointerup", {});
      expect(down.defaultPrevented).toBe(true);
      expect(camera.getPosition()).not.toEqual(before);
      const after = camera.getPosition(),
        t = camera.getTarget();
      expect(after.x - before.x).toBeCloseTo(t.x - target.x);
      expect(after.z - before.z).toBeCloseTo(t.z - target.z);
      const distance = () => {
        const p = camera.getPosition(),
          q = camera.getTarget();
        return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      };
      const d = distance();
      event(canvas, "wheel", { deltaY: -100, deltaMode: 0 });
      expect(distance()).toBeLessThan(d);
      const near = distance();
      event(canvas, "wheel", { deltaY: 100, deltaMode: 0 });
      expect(distance()).toBeGreaterThan(near);
    }
    mode = "walk";
    canvas.focus();
    const start = camera.getPosition();
    event(canvas, "keydown", { key: "w", repeat: false });
    event(win, "keyup", { key: "w" });
    expect(camera.getPosition()).not.toEqual(start);
    doc.activeElement = { tagName: "TEXTAREA" };
    const stopped = camera.getPosition();
    event(canvas, "keydown", { key: "w", repeat: false });
    expect(camera.getPosition()).toEqual(stopped);
    expect(requested).toBeGreaterThan(0);
    cleanup();
    const final = camera.getPosition();
    event(canvas, "wheel", { deltaY: -100, deltaMode: 0 });
    expect(camera.getPosition()).toEqual(final);
  } finally {
    cleanup();
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
