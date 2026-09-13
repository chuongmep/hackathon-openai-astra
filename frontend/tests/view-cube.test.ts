import { test, expect } from "bun:test";
import { cubeBasis } from "../src/components/ViewCube";
test("cube shows the same axes as a front-facing camera", () => {
  const b = cubeBasis([0, 0, 1], [0, 1, 0]);
  expect(b.x).toEqual([1, 0, 0]);
  expect(b.y).toEqual([0, 1, 0]);
});
test("cube basis stays finite at the top and bottom poles", () => {
  for (const direction of [
    [0, 1, 0],
    [0, -1, 0],
  ] as [number, number, number][]) {
    const b = cubeBasis(direction, [0, 1, 0]);
    for (const axis of [b.x, b.y, b.z])
      expect(Math.hypot(...axis)).toBeCloseTo(1);
  }
});
