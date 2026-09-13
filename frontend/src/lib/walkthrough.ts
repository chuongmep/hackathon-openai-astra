export type Point = { x: number; y: number; z: number };
export function walkStep(
  eye: Point,
  target: Point,
  forward: number,
  right: number,
  up: number,
  seconds: number,
) {
  const dx = target.x - eye.x,
    dz = target.z - eye.z,
    len = Math.hypot(dx, dz) || 1;
  const scale =
    (3 * Math.min(seconds, 0.05)) / Math.max(1, Math.hypot(forward, right, up));
  const offset = {
    x: ((dx / len) * forward - (dz / len) * right) * scale,
    y: up * scale,
    z: ((dz / len) * forward + (dx / len) * right) * scale,
  };
  return {
    eye: { x: eye.x + offset.x, y: eye.y + offset.y, z: eye.z + offset.z },
    target: {
      x: target.x + offset.x,
      y: target.y + offset.y,
      z: target.z + offset.z,
    },
  };
}
export function lookTarget(eye: Point, target: Point, dx: number, dy: number) {
  const x = target.x - eye.x,
    y = target.y - eye.y,
    z = target.z - eye.z;
  const length = Math.hypot(x, y, z) || 1;
  const yaw = Math.atan2(x, z) - dx * 0.004;
  const pitch = Math.max(
    -1.5,
    Math.min(
      1.5,
      Math.asin(Math.max(-1, Math.min(1, y / length))) - dy * 0.004,
    ),
  );
  return {
    x: eye.x + Math.sin(yaw) * Math.cos(pitch) * length,
    y: eye.y + Math.sin(pitch) * length,
    z: eye.z + Math.cos(yaw) * Math.cos(pitch) * length,
  };
}
