import { expect, test } from "bun:test";
import { resolveAction } from "../src/lib/actions";
import type { IfcDataStore } from "@ifc-lite/parser";
import type { Action, Model } from "../src/lib/api";
const model = { id: "model", model_revision: "revision" } as Model;
const store = {
  entities: {
    getExpressIdByGlobalId: (guid: string) => (guid === "door-guid" ? 42 : 0),
  },
} as unknown as IfcDataStore;
const action: Action = {
  model_id: "model",
  model_revision: "revision",
  action: "isolate",
  guids: ["door-guid"],
};
test("viewer actions resolve GUIDs in the active parser, rejecting stale model/revision", () => {
  expect(resolveAction(action, model, store)).toEqual([42]);
  expect(
    resolveAction({ ...action, model_revision: "old" }, model, store),
  ).toBeNull();
  expect(
    resolveAction({ ...action, model_id: "other" }, model, store),
  ).toBeNull();
  expect(resolveAction(action, null, store)).toBeNull();
  expect(() =>
    resolveAction({ ...action, guids: ["missing"] }, model, store),
  ).toThrow();
});

test("framing folds per-element local origins into world-space bounds", async () => {
  const { meshBounds } = await import("../src/lib/actions");
  expect(
    meshBounds([
      { positions: new Float32Array([0, 0, 0, 1, 2, 3]), origin: [10, 20, 30] },
      { positions: new Float32Array([-1, -2, -3]), origin: [5, 6, 7] },
    ]),
  ).toEqual({ min: { x: 4, y: 4, z: 4 }, max: { x: 11, y: 22, z: 33 } });
  expect(meshBounds([])).toBeNull();
});
