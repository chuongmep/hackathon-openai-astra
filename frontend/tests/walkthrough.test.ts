import { test, expect } from "bun:test";
import { walkStep, lookTarget } from "../src/lib/walkthrough";
const eye = { x: 0, y: 1.7, z: 0 },
  target = { x: 0, y: 1.7, z: -1 };
test("walk preserves eye height and facing, with frame independent speed", () => {
  let p = { eye, target };
  for (let i = 0; i < 60; i++) p = walkStep(p.eye, p.target, 1, 0, 0, 1 / 60);
  expect(p.eye.z).toBeCloseTo(-3);
  expect(p.eye.y).toBe(1.7);
  expect(p.target.z - p.eye.z).toBeCloseTo(-1);
});
test("diagonal speed is normalized and long paused frames are capped", () => {
  const p = walkStep(eye, target, 1, 1, 0, 10);
  expect(Math.hypot(p.eye.x, p.eye.z)).toBeCloseTo(0.15);
});
test("look rotates around fixed eye and clamps vertical pitch", () => {
  const t = lookTarget(eye, target, 100, 10000);
  expect(Object.values(t).every(Number.isFinite)).toBe(true);
  expect(Math.hypot(t.x - eye.x, t.y - eye.y, t.z - eye.z)).toBeCloseTo(1);
});
