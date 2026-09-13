/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { walkStep, lookTarget } from "./walkthrough";
import { Renderer } from "@ifc-lite/renderer";
type ViewerSession = { renderer: Renderer; destroy: () => void };
function setupCameraControls(
  canvas: HTMLCanvasElement,
  renderer: Renderer,
  mode: () => string,
): () => void {
  const camera = renderer.getCamera();
  let isDragging = false;
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  const onMouseDown = (event: MouseEvent) => {
    if (event.button > 2) return;
    camera.reset();
    camera.setInteractionMode("orbit");
    canvas.focus();
    isDragging = true;
    isPanning =
      mode() === "pan" ||
      event.button === 1 ||
      event.button === 2 ||
      event.shiftKey;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.style.cursor = isPanning ? "move" : "grabbing";
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!isDragging) return;
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    if (mode() === "walk") {
      const t = lookTarget(
        camera.getPosition(),
        camera.getTarget(),
        deltaX,
        deltaY,
      );
      camera.setTarget(t.x, t.y, t.z);
    } else if (isPanning) {
      camera.pan(deltaX, deltaY);
    } else {
      camera.orbit(deltaX, deltaY);
    }
  };

  const stopDrag = () => {
    isDragging = false;
    isPanning = false;
    canvas.style.cursor = "grab";
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (mode() !== "walk") camera.zoom(event.deltaY);
  };

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  const keys = new Set<string>();
  const clearKeys = () => {
    keys.clear();
    stopDrag();
  };
  const keydown = (e: KeyboardEvent) => {
    if (mode() !== "walk" || document.activeElement !== canvas) return;
    const key = e.key.toLowerCase();
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "q",
        "e",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(key)
    ) {
      e.preventDefault();
      if (!keys.has(key) && !e.repeat) {
        const pose = walkStep(
          camera.getPosition(),
          camera.getTarget(),
          ["w", "arrowup"].includes(key)
            ? 1
            : ["s", "arrowdown"].includes(key)
              ? -1
              : 0,
          ["d", "arrowright"].includes(key)
            ? 1
            : ["a", "arrowleft"].includes(key)
              ? -1
              : 0,
          key === "e" ? 1 : key === "q" ? -1 : 0,
          1 / 60,
        );
        camera.setPosition(pose.eye.x, pose.eye.y, pose.eye.z);
        camera.setTarget(pose.target.x, pose.target.y, pose.target.z);
      }
      keys.add(key);
    }
  };
  const keyup = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  let last = performance.now(),
    walkFrame = 0;
  const tick = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    if (mode() === "walk" && document.activeElement === canvas && keys.size) {
      const has = (...k: string[]) => (k.some((v) => keys.has(v)) ? 1 : 0);
      const pose = walkStep(
        camera.getPosition(),
        camera.getTarget(),
        has("w", "arrowup") - has("s", "arrowdown"),
        has("d", "arrowright") - has("a", "arrowleft"),
        has("e") - has("q"),
        dt,
      );
      camera.setPosition(pose.eye.x, pose.eye.y, pose.eye.z);
      camera.setTarget(pose.target.x, pose.target.y, pose.target.z);
    } else keys.clear();
    walkFrame = requestAnimationFrame(tick);
  };
  walkFrame = requestAnimationFrame(tick);
  canvas.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", clearKeys);
  canvas.addEventListener("blur", clearKeys);
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", stopDrag);

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.style.cursor = "grab";

  return () => {
    cancelAnimationFrame(walkFrame);
    canvas.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("blur", clearKeys);
    canvas.removeEventListener("blur", clearKeys);
    canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", stopDrag);

    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
  };
}

export async function createViewer(
  canvas: HTMLCanvasElement,
  selection: { current: number | null },
  options: { current: NonNullable<Parameters<Renderer["render"]>[0]> },
  mode: () => string = () => "orbit",
): Promise<ViewerSession> {
  const renderer = new Renderer(canvas);
  await renderer.init();

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.resize(width, height);
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const cleanupControls = setupCameraControls(canvas, renderer, mode);

  let destroyed = false;
  let frameId = 0;
  let previousFrame = performance.now();
  const loop = () => {
    if (destroyed) return;
    const now = performance.now();
    if (renderer.getCamera().update((now - previousFrame) / 1000))
      renderer.requestRender();
    previousFrame = now;
    renderer.render({
      ...options.current,
      selectedId: selection.current,
      clearColor: [0.89, 0.92, 0.9, 1],
    });
    frameId = requestAnimationFrame(loop);
  };
  loop();

  return {
    renderer,
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(frameId);
      cleanupControls();
      observer.disconnect();
      renderer.destroy();
    },
  };
}
