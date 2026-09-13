/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Renderer } from "@ifc-lite/renderer";
export type ViewState = { selected: Set<number>; isolated: Set<number> | null };
type ViewerSession = { renderer: Renderer; destroy: () => void };
function setupCameraControls(
  canvas: HTMLCanvasElement,
  renderer: Renderer,
): () => void {
  const camera = renderer.getCamera();
  let isDragging = false;
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  const onMouseDown = (event: MouseEvent) => {
    isDragging = true;
    isPanning = event.button === 1 || event.button === 2 || event.shiftKey;
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

    if (isPanning) {
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
    camera.zoom(event.deltaY);
  };

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", stopDrag);
  canvas.addEventListener("mouseleave", stopDrag);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.style.cursor = "grab";

  return () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", stopDrag);
    canvas.removeEventListener("mouseleave", stopDrag);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
  };
}

export async function createViewer(
  canvas: HTMLCanvasElement,
  selection: { current: number | null },
  view: { current: ViewState },
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
  const cleanupControls = setupCameraControls(canvas, renderer);

  let destroyed = false;
  let frameId = 0;
  const loop = () => {
    if (destroyed) return;
    renderer.render({
      selectedId: selection.current,
      selectedIds: view.current.selected,
      isolatedIds: view.current.isolated,
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
