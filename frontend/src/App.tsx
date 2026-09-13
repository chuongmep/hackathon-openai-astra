import { useEffect, useMemo, useRef, useState } from "react";
import { GeometryProcessor } from "@ifc-lite/geometry";
import { IfcParser, type IfcDataStore } from "@ifc-lite/parser";
import {
  Box,
  ChevronDown,
  ChevronUp,
  Download,
  FileBox,
  FolderOpen,
  Maximize,
  Search,
  Table2,
  Upload,
  X,
} from "lucide-react";
import { createViewer } from "./lib/viewer";
import {
  exportWorkbook,
  modelRows,
  properties,
  type ModelRow,
} from "./lib/model";
import { ModelTree } from "./components/ModelTree";
import { ChatPanel } from "./components/ChatPanel";
export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null),
    input = useRef<HTMLInputElement>(null),
    session = useRef<Awaited<ReturnType<typeof createViewer>>>(),
    processor = useRef<GeometryProcessor>(),
    selection = useRef<number | null>(null),
    generation = useRef(0),
    loading = useRef(false),
    down = useRef({ x: 0, y: 0 });
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Initializing viewer…"),
    [error, setError] = useState(""),
    [store, setStore] = useState<IfcDataStore>(),
    [rows, setRows] = useState<ModelRow[]>([]),
    [name, setName] = useState("Untitled workspace"),
    [selected, setSelected] = useState<number | null>(null),
    [propertiesOpen, setPropertiesOpen] = useState(true),
    [query, setQuery] = useState(""),
    [sheet, setSheet] = useState(true),
    [sheetHeight, setSheetHeight] = useState(240),
    [treeWidth, setTreeWidth] = useState(265),
    [sheetQuery, setSheetQuery] = useState(""),
    [exporting, setExporting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    generation.current++;
    let own: Awaited<ReturnType<typeof createViewer>> | undefined;
    let geometry: GeometryProcessor | undefined;
    (async () => {
      try {
        if (!("gpu" in navigator))
          throw new Error(
            "WebGPU unavailable. Use current Chrome or Edge on localhost or HTTPS.",
          );
        own = await createViewer(canvas.current!, selection);
        if (cancelled) {
          own.destroy();
          return;
        }
        geometry = new GeometryProcessor();
        await geometry.init();
        if (cancelled) {
          geometry.dispose();
          return;
        }
        session.current = own;
        processor.current = geometry;
        setReady(true);
        setStatus("Ready to explore");
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Viewer initialization failed",
          );
      }
    })();
    return () => {
      cancelled = true;
      generation.current++;
      own?.destroy();
      geometry?.dispose();
    };
  }, []);
  function select(id: number | null) {
    selection.current = id;
    if (id !== null) setPropertiesOpen(true);
    setSelected(id);
    session.current?.renderer.requestRender();
  }
  async function load(file: File) {
    if (!ready || loading.current) return;
    if (!/\.ifc$/i.test(file.name)) {
      setError("Choose a file with the .ifc extension.");
      return;
    }
    loading.current = true;
    setBusy(true);
    setError("");
    const token = generation.current;
    try {
      setStatus("Reading IFC metadata…");
      const bytes = await file.arrayBuffer();
      const next = await new IfcParser().parseColumnar(bytes);
      if (token !== generation.current) return;
      const meshes: import("@ifc-lite/geometry").MeshData[] = [];
      for await (const event of processor.current!.processStreaming(
        new Uint8Array(bytes),
      )) {
        if (token !== generation.current) return;
        if (event.type === "batch") {
          meshes.push(...event.meshes);
          setStatus(`Processing ${event.totalSoFar.toLocaleString()} meshes…`);
        }
      }
      if (!meshes.length)
        throw new Error("No renderable geometry found in this file.");
      session.current!.renderer.loadGeometry(meshes);
      session.current!.renderer.fitToView();
      setStore(next);
      setRows(
        modelRows(
          next,
          meshes.map((m) => m.expressId),
        ),
      );
      setName(file.name);
      select(null);
      setQuery("");
      setStatus("Model loaded");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load model");
      setStatus("Load failed");
    } finally {
      loading.current = false;
      if (token === generation.current) setBusy(false);
    }
  }
  async function sample() {
    try {
      const response = await fetch("/models/racbasicsampleproject.ifc");
      if (!response.ok) throw new Error("Sample model download failed");
      await load(
        new File([await response.blob()], "racbasicsampleproject.ifc"),
      );
    } catch (e) {
      setError(String(e));
    }
  }
  const current = rows.find((r) => r.id === selected),
    psets = useMemo(
      () => (store && selected !== null ? properties(store, selected) : []),
      [store, selected],
    ),
    filtered = useMemo(
      () =>
        rows.filter((r) =>
          `${r.name} ${r.type} ${r.level} ${r.id}`
            .toLowerCase()
            .includes(sheetQuery.toLowerCase()),
        ),
      [rows, sheetQuery],
    );
  function resize(e: React.PointerEvent, kind: "tree" | "sheet") {
    const start = kind === "tree" ? e.clientX : e.clientY,
      initial = kind === "tree" ? treeWidth : sheetHeight,
      target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (event: Event) => {
      const p = event as PointerEvent;
      if (kind === "tree")
        setTreeWidth(Math.max(210, Math.min(420, initial + p.clientX - start)));
      else
        setSheetHeight(
          Math.max(
            130,
            Math.min(window.innerHeight - 250, initial + start - p.clientY),
          ),
        );
    };
    const stop = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointercancel", stop);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointercancel", stop);
  }
  return (
    <div className="workspace">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Box size={22} />
          </span>
          forma<span className="brand-dot">.</span>
        </a>
        <div className="project-title">
          <span>WORKSPACE</span>
          <strong>{name}</strong>
        </div>
        <div className="header-actions">
          <span className="local-label">
            <span className="dot" /> Local workspace
          </span>
          <button onClick={() => void sample()} disabled={!ready || busy}>
            <FileBox size={16} /> Sample model
          </button>
          <button
            className="primary"
            onClick={() => input.current?.click()}
            disabled={!ready || busy}
          >
            <Upload size={16} /> Open IFC
          </button>
          <div className="avatar">ME</div>
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept=".ifc"
          aria-label="Open IFC file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void load(file);
            e.target.value = "";
          }}
        />
      </header>
      <div className="work-area">
        <section className="model-workspace">
          <div className="upper-workspace">
            <aside className="model-panel" style={{ width: treeWidth }}>
              <div className="panel-heading">
                <span>
                  <FolderOpen size={16} /> Model explorer
                </span>
                <span className="count">{rows.length}</span>
              </div>
              <label className="search">
                <Search size={15} />
                <input
                  placeholder="Find an element…"
                  aria-label="Search model tree"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="tree-scroll">
                {store ? (
                  <ModelTree
                    store={store}
                    rows={rows}
                    selected={selected}
                    onSelect={select}
                    query={query}
                  />
                ) : (
                  <p className="empty-copy">
                    Your model hierarchy will appear here after opening an IFC.
                  </p>
                )}
              </div>

              <div className="panel-footer">
                <Box size={13} /> {store?.schemaVersion || "IFC model"}
                <span>IFC Lite</span>
              </div>
            </aside>
            <div
              className="vertical-resizer"
              role="separator"
              aria-label="Resize model explorer"
              aria-orientation="vertical"
              tabIndex={0}
              onPointerDown={(e) => resize(e, "tree")}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight")
                  setTreeWidth((w) => Math.min(420, w + 20));
                if (e.key === "ArrowLeft")
                  setTreeWidth((w) => Math.max(210, w - 20));
              }}
            />
            <main
              className="viewport-shell"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void load(file);
              }}
            >
              <canvas
                ref={canvas}
                aria-label="Interactive IFC 3D model"
                onPointerDown={(e) => {
                  down.current = { x: e.clientX, y: e.clientY };
                }}
                onPointerUp={async (e) => {
                  if (
                    e.button !== 0 ||
                    busy ||
                    Math.hypot(
                      e.clientX - down.current.x,
                      e.clientY - down.current.y,
                    ) > 4
                  )
                    return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  try {
                    const hit = await session.current?.renderer.pick(
                      e.clientX - rect.left,
                      e.clientY - rect.top,
                    );
                    select(hit?.expressId ?? null);
                    if (hit) setPropertiesOpen(true);
                  } catch {
                    setError(
                      "Unable to select this element. Try the model tree.",
                    );
                  }
                }}
              />
              <div className="viewport-title">
                <span>
                  <Box size={15} /> 3D view
                </span>
                <span className="view-tag">PERSPECTIVE</span>
              </div>
              <div className="viewer-tools">
                <button
                  aria-label="Fit model to view"
                  onClick={() => session.current?.renderer.fitToView()}
                  disabled={!rows.length}
                >
                  <Maximize size={18} />
                </button>
                <button
                  aria-label="Toggle data sheet"
                  onClick={() => setSheet((s) => !s)}
                >
                  <Table2 size={18} />
                </button>
              </div>
              {!rows.length && !busy && !error && (
                <div className="welcome">
                  <h1>
                    Every detail.
                    <br />
                    One workspace.
                  </h1>
                  <p>
                    Bring your building into view.
                    <br />
                    Drop an IFC file here to start exploring.
                  </p>
                  <button
                    className="primary"
                    onClick={() => input.current?.click()}
                    disabled={!ready}
                  >
                    <Upload size={16} /> Open IFC file
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void sample()}
                    disabled={!ready}
                  >
                    or explore the sample project ↗
                  </button>
                </div>
              )}
              {busy && (
                <div className="loading" role="status">
                  <span className="spinner" />
                  {status}
                </div>
              )}
              {error && (
                <div className="viewer-error" role="alert">
                  <strong>Something needs attention</strong>
                  <p>{error}</p>
                  <button onClick={() => setError("")}>Dismiss</button>
                </div>
              )}
              {selected !== null && propertiesOpen && (
                <aside
                  className="scene-properties"
                  aria-label="Element properties"
                >
                  <div className="scene-properties-heading">
                    <span>Element properties</span>
                    <button
                      aria-label="Close properties"
                      onClick={() => setPropertiesOpen(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="properties">
                    {selected !== null ? (
                      <>
                        <div className="property-title">
                          <Box size={20} />
                          <h3>{current?.name || `Element #${selected}`}</h3>
                        </div>
                        <dl>
                          <dt>Express ID</dt>
                          <dd>#{selected}</dd>
                          <dt>IFC class</dt>
                          <dd>{current?.type}</dd>
                          <dt>Global ID</dt>
                          <dd>{current?.globalId}</dd>
                        </dl>
                        {psets.map((p, i) => (
                          <details key={i} open>
                            <summary>{p.name}</summary>
                            <dl>
                              {p.properties.map((v, j) => (
                                <div key={j}>
                                  <dt>{v.name}</dt>
                                  <dd>{String(v.value ?? "—")}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        ))}
                        {!psets.length && (
                          <p className="muted">
                            No property sets on this element.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="empty-copy">
                        Click an element in the scene, tree, or data sheet to
                        inspect its properties.
                      </p>
                    )}
                  </div>
                </aside>
              )}
              {current && (
                <button
                  className="selected-chip"
                  onClick={() => setPropertiesOpen(true)}
                >
                  <span className="dot" />
                  {current.type} · #{current.id}
                  <span>View properties ↗</span>
                </button>
              )}
              <div className="viewport-footer">
                <span>
                  <span className="dot" />
                  {busy
                    ? status
                    : rows.length
                      ? `${rows.length.toLocaleString()} elements · ${status}`
                      : status}
                </span>
                <span>
                  Drag to orbit · Shift + drag to pan · Scroll to zoom
                </span>
              </div>
            </main>
          </div>
          <section
            className="data-sheet"
            style={{ height: sheet ? sheetHeight : 45 }}
          >
            {sheet && (
              <div
                className="horizontal-resizer"
                role="separator"
                aria-label="Resize data sheet"
                aria-orientation="horizontal"
                tabIndex={0}
                onPointerDown={(e) => resize(e, "sheet")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp")
                    setSheetHeight((h) =>
                      Math.min(window.innerHeight - 250, h + 20),
                    );
                  if (e.key === "ArrowDown")
                    setSheetHeight((h) => Math.max(130, h - 20));
                }}
              />
            )}
            <div className="sheet-heading">
              <button
                className="sheet-toggle"
                onClick={() => setSheet((s) => !s)}
              >
                <Table2 size={16} /> Model data{" "}
                <span className="count">{rows.length}</span>
              </button>
              <div className="sheet-actions">
                {sheet && (
                  <>
                    <label className="sheet-search">
                      <Search size={14} />
                      <input
                        aria-label="Filter data sheet"
                        placeholder="Filter elements…"
                        value={sheetQuery}
                        onChange={(e) => setSheetQuery(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={!rows.length || exporting}
                      onClick={async () => {
                        setExporting(true);
                        try {
                          await exportWorkbook(filtered, name);
                        } catch {
                          setError("Excel export failed. Please try again.");
                        } finally {
                          setExporting(false);
                        }
                      }}
                    >
                      <Download size={14} />
                      {exporting ? "Exporting…" : "Export .xlsx"}
                    </button>
                  </>
                )}
                <button
                  aria-label={sheet ? "Close data sheet" : "Expand data sheet"}
                  onClick={() => setSheet((s) => !s)}
                >
                  {sheet ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>
              </div>
            </div>
            {sheet && (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Element name</th>
                        <th>IFC class</th>
                        <th>Level</th>
                        <th>Global ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => (
                        <tr
                          key={row.id}
                          className={selected === row.id ? "selected" : ""}
                          onClick={() => {
                            select(row.id);
                            setPropertiesOpen(true);
                          }}
                        >
                          <td>
                            <button
                              className="row-select"
                              onClick={() => {
                                select(row.id);
                                setPropertiesOpen(true);
                              }}
                              aria-label={`Select element ${row.id}`}
                            >
                              {row.id}
                            </button>
                          </td>
                          <td title={row.name}>{row.name}</td>
                          <td>
                            <span className="type-pill">{row.type}</span>
                          </td>
                          <td>{row.level}</td>
                          <td className="mono">{row.globalId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <p className="empty-copy">
                      {rows.length
                        ? "No elements match your filter."
                        : "Open a model to explore its element data."}
                    </p>
                  )}
                </div>
                <div className="sheet-footer">
                  <span>
                    <Table2 size={12} /> Elements
                  </span>
                  <span>
                    {filtered.length.toLocaleString()} rows · ExcelJS export
                  </span>
                </div>
              </>
            )}
          </section>
        </section>
        <ChatPanel key={name} rows={rows} selected={current} name={name} />
      </div>
    </div>
  );
}
