import { useState } from "react";
import { Box, ChevronRight, Layers } from "lucide-react";
import type { IfcDataStore } from "@ifc-lite/parser";
import type { ModelRow } from "../lib/model";
type Node = NonNullable<IfcDataStore["spatialHierarchy"]>["project"];
function Branch({
  node,
  rows,
  selected,
  onSelect,
}: {
  node: Node;
  rows: ModelRow[];
  selected: number | null;
  onSelect(id: number): void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        className="tree-node"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ChevronRight
          size={13}
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        />
        <Layers size={14} />
        <span>{node.name || "Unnamed group"}</span>
      </button>
      {open && (
        <div className="tree-children">
          {node.children.map((n) => (
            <Branch
              key={n.expressId}
              node={n}
              rows={rows}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
          {rows
            .filter((r) => node.elements.includes(r.id))
            .map((r) => (
              <Element
                key={r.id}
                row={r}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
        </div>
      )}
    </div>
  );
}
function Element({
  row,
  selected,
  onSelect,
}: {
  row: ModelRow;
  selected: number | null;
  onSelect(id: number): void;
}) {
  return (
    <button
      title={row.name}
      className={`tree-element ${selected === row.id ? "selected" : ""}`}
      onClick={() => onSelect(row.id)}
    >
      <Box size={14} />
      <span>{row.name}</span>
      <small>#{row.id}</small>
    </button>
  );
}
export function ModelTree({
  store,
  rows,
  selected,
  onSelect,
  query,
}: {
  store: IfcDataStore;
  rows: ModelRow[];
  selected: number | null;
  onSelect(id: number): void;
  query: string;
}) {
  const root = store.spatialHierarchy?.project;
  const ids = new Set<number>();
  function collect(n: Node) {
    n.elements.forEach((id) => ids.add(id));
    n.children.forEach(collect);
  }
  if (root) collect(root);
  return (
    <div className="tree">
      {query ? (
        rows
          .filter((r) =>
            `${r.name} ${r.type} ${r.id}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((r) => (
            <Element
              key={r.id}
              row={r}
              selected={selected}
              onSelect={onSelect}
            />
          ))
      ) : (
        <>
          {root && (
            <Branch
              node={root}
              rows={rows}
              selected={selected}
              onSelect={onSelect}
            />
          )}
          <details>
            <summary>Other elements</summary>
            {rows
              .filter((r) => !ids.has(r.id))
              .map((r) => (
                <Element
                  key={r.id}
                  row={r}
                  selected={selected}
                  onSelect={onSelect}
                />
              ))}
          </details>
        </>
      )}
    </div>
  );
}
