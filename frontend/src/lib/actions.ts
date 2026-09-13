import type { Action, Model } from "./api";
import type { IfcDataStore } from "@ifc-lite/parser";

export function resolveAction(
  action: Action,
  model: Model | null,
  store: IfcDataStore | undefined,
): number[] | null {
  if (
    !model ||
    !store ||
    action.model_id !== model.id ||
    action.model_revision !== model.model_revision
  )
    return null;
  if (action.action === "reset") return [];
  const ids = action.guids
    .map((guid) => store.entities.getExpressIdByGlobalId(guid))
    .filter((id) => id > 0);
  if (!ids.length)
    throw new Error("Requested objects were not found in the viewer");
  return [...new Set(ids)];
}

// Renderer vertices use per-element local frames; include the mesh origin.
export function meshBounds(
  meshes: Pick<import("@ifc-lite/geometry").MeshData, "positions" | "origin">[],
) {
  const min = { x: Infinity, y: Infinity, z: Infinity },
    max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const mesh of meshes) {
    const origin = mesh.origin ?? [0, 0, 0];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i] + origin[0],
        y = mesh.positions[i + 1] + origin[1],
        z = mesh.positions[i + 2] + origin[2];
      min.x = Math.min(min.x, x);
      min.y = Math.min(min.y, y);
      min.z = Math.min(min.z, z);
      max.x = Math.max(max.x, x);
      max.y = Math.max(max.y, y);
      max.z = Math.max(max.z, z);
    }
  }
  return Number.isFinite(min.x) ? { min, max } : null;
}
