import { FloatingProperties } from "./components/FloatingProperties";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeometryProcessor } from "@ifc-lite/geometry";
import { IfcParser, type IfcDataStore } from "@ifc-lite/parser";
import {
  Box,
  PanelRightOpen,
  ChevronDown,
  ChevronUp,
  Download,
  FileBox,
  FolderOpen,
  Maximize,
  Search,
  Table2,
  Upload,
} from "lucide-react";
import {
  api,
  upload,
  type Model,
  type Schedule,
  type Report,
  type Action,
  type Context,
  type Entity,
  type Workbook,
} from "./lib/api";
import { mappingError } from "./lib/schedule";
import { resolveAction, meshBounds } from "./lib/actions";
import { ValidationPanel } from "./components/ValidationPanel";
import { ReviewController } from "./lib/review";
import { registerReviewTools } from "./lib/webmcp";
import { ReviewPanel } from "./components/ReviewPanel";
import { createViewer } from "./lib/viewer";
import {
  exportWorkbook,
  modelRows,
  properties,
  type ModelRow,
} from "./lib/model";
import { ModelTree } from "./components/ModelTree";
import { ChatPanel } from "./components/ChatPanel";
import { SceneControls, type SceneOptions } from "./components/SceneControls";
export default function App() {
  const [model, setModel] = useState<Model | null>(null);
  const [workbook, setWorkbook] = useState<Workbook>();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [details, setDetails] = useState<unknown>(null);
  const active = useRef<Model | null>(null);
  const parsed = useRef<IfcDataStore>();
  const meshesRef = useRef<import("@ifc-lite/geometry").MeshData[]>([]);
  const sceneOptions = useRef<SceneOptions>({});
  const [review] = useState(() => new ReviewController(sceneOptions));
  const [bridgeStatus, setBridgeStatus] = useState("Local tools");
  review.select = select;
  useEffect(() => {
    const abort = new AbortController();
    let dispose: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      void registerReviewTools(review, setBridgeStatus, abort).then((fn) => {
        if (abort.signal.aborted) fn();
        else dispose = fn;
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
      dispose?.();
    };
  }, [review]);

  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const chatMaxWidth = viewportWidth * 0.25;
  const chatMinWidth = Math.min(280, chatMaxWidth);
  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);
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
    [chatWidth, setChatWidth] = useState(330),
    [chatVisible, setChatVisible] = useState(true),
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
        own = await createViewer(
          canvas.current!,
          selection,
          sceneOptions,
          () => review.state.mode,
        );
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
        review.renderer = own.renderer;
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
  review.focusScene = () => canvas.current?.focus();
  function select(id: number | null) {
    selection.current = id;
    review.update({ selected: id, highlighted: [] });
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
    const token = ++generation.current;
    active.current = null;
    setModel(null);
    setReport(null);
    setDetails(null);
    select(null);
    try {
      setStatus("Reading IFC metadata…");
      setStatus("Uploading IFC to backend…");
      const uploaded = await upload<Model>("/models", file);
      const original = await fetch(`/api/v1/models/${uploaded.id}/file`);
      if (!original.ok) throw new Error("Unable to fetch original IFC");
      const bytes = await original.arrayBuffer();
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
      const entityRows: Entity[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await api<{ items: Entity[]; total: number }>(
          `/models/${uploaded.id}/entities?offset=${offset}&limit=500`,
        );
        entityRows.push(...page.items);
        if (entityRows.length >= page.total) break;
      }
      if (token !== generation.current) return;
      parsed.current = next;
      meshesRef.current = meshes;
      session.current!.renderer.loadGeometry(meshes);
      session.current!.renderer.fitToView();
      setStore(next);
      const nextRows = modelRows(
        next,
        entityRows
          .map((e) => next.entities.getExpressIdByGlobalId(e.GlobalId))
          .filter((id) => id > 0),
      );
      setRows(nextRows);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const modelKey = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      review.load(modelKey, file.name, next, nextRows);
      setName(file.name);
      active.current = uploaded;
      setModel(uploaded);
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
  const context: Context | null = model
    ? {
        model_id: model.id,
        model_revision: model.model_revision,
        selected_guids: current?.globalId ? [current.globalId] : [],
        workbook_id: workbook?.id ?? null,
        schedule: mappingError(workbook, schedule) ? null : schedule,
        history: [],
      }
    : null;
  useEffect(() => {
    setDetails(null);
    if (!model || !current?.globalId) return;
    const controller = new AbortController();
    void api(`/models/${model.id}/entities/${current.globalId}`, {
      signal: controller.signal,
    })
      .then(setDetails)
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [model, current?.globalId]);
  function applyAction(action: Action) {
    try {
      const ids = resolveAction(action, active.current, parsed.current);
      if (ids === null) return;
      const renderer = session.current!.renderer;
      if (action.action === "reset") {
        review.reset();
        select(null);
        renderer.fitToView();
        return;
      }
      if (action.action === "select") select(ids[0]);
      if (action.action === "highlight") review.update({ highlighted: ids });
      if (action.action === "isolate") {
        review.visibility("isolate", ids);
        setStatus(`${ids.length} isolated`);
      }
      if (action.action === "frame") {
        const wanted = new Set(ids);
        const bounds = meshBounds(
          meshesRef.current.filter((mesh) => wanted.has(mesh.expressId)),
        );
        if (bounds) renderer.getCamera().fitToBounds(bounds.min, bounds.max);
      }
      renderer.requestRender();
    } catch (e) {
      setError(String(e));
    }
  }
  function aiEvent(event: string, raw: unknown) {
    if (event === "viewer_action") applyAction(raw as Action);
    if (event === "result") {
      const data = raw as { tool: string; data: Partial<Report> };
      if (data.tool === "validate_materials" && data.data.id)
        void api<Report>(`/validations/${data.data.id}`)
          .then((result) => {
            if (
              active.current?.id === result.model_id &&
              active.current.model_revision === result.model_revision
            ) {
              setReport(result);
              setSheet(true);
              setSheetHeight(360);
            }
          })
          .catch((e) => setError(String(e)));
    }
  }
  function resize(e: React.PointerEvent, kind: "tree" | "sheet" | "chat") {
    const start = kind !== "sheet" ? e.clientX : e.clientY,
      initial =
        kind === "tree"
          ? treeWidth
          : kind === "chat"
            ? Math.min(chatWidth, chatMaxWidth)
            : sheetHeight,
      target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (event: Event) => {
      const p = event as PointerEvent;
      if (kind === "tree")
        setTreeWidth(Math.max(210, Math.min(420, initial + p.clientX - start)));
      else if (kind === "chat")
        setChatWidth(
          Math.max(
            chatMinWidth,
            Math.min(chatMaxWidth, initial + start - p.clientX),
          ),
        );
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
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && review.state.mode === "walk")
                    review.update({ mode: "orbit" });
                }}
                onPointerDown={(e) => {
                  down.current = { x: e.clientX, y: e.clientY };
                }}
                onPointerUp={async (e) => {
                  if (
                    e.button !== 0 ||
                    busy ||
                    review.state.mode !== "orbit" ||
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
                      {
                        isolatedIds: sceneOptions.current.isolatedIds,
                        hiddenIds: sceneOptions.current.hiddenIds,
                      },
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
              <SceneControls
                controller={review}
                loaded={rows.length > 0 && !busy}
              />
              <ReviewPanel controller={review} />
              <div className="viewport-title">
                <span>
                  <Box size={15} /> 3D view
                </span>
                <span className="view-tag">PERSPECTIVE</span>
              </div>
              <div className="viewer-tools">
                <button
                  aria-label="Fit model to view"
                  onClick={() => {
                    review.reset();
                    select(null);
                    session.current?.renderer.fitToView();
                    setStatus("Model loaded");
                  }}
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
                <FloatingProperties onClose={() => setPropertiesOpen(false)}>
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
                        {details !== null && (
                          <details>
                            <summary>
                              Verified backend properties and materials
                            </summary>
                            <pre>{JSON.stringify(details, null, 2)}</pre>
                          </details>
                        )}
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
                </FloatingProperties>
              )}
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
                <ValidationPanel
                  book={workbook}
                  onBook={setWorkbook}
                  model={model}
                  schedule={schedule}
                  onSchedule={setSchedule}
                  report={report}
                  onReport={(r) => {
                    setReport(r);
                    if (r) setSheetHeight(360);
                  }}
                  onAction={applyAction}
                  onSelect={(guid) => {
                    const id =
                      parsed.current?.entities.getExpressIdByGlobalId(guid);
                    if (id && id > 0) {
                      select(id);
                      if (model)
                        applyAction({
                          model_id: model.id,
                          model_revision: model.model_revision,
                          action: "frame",
                          guids: [guid],
                        });
                    }
                  }}
                />
                {!report && (
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
                )}
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
        {chatVisible && (
          <div
            className="chat-resizer"
            role="separator"
            aria-label="Resize chat panel"
            aria-orientation="vertical"
            aria-valuemin={chatMinWidth}
            aria-valuemax={chatMaxWidth}
            aria-valuenow={Math.min(chatWidth, chatMaxWidth)}
            tabIndex={0}
            onPointerDown={(e) => resize(e, "chat")}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                setChatWidth((w) =>
                  Math.max(
                    chatMinWidth,
                    Math.min(
                      chatMaxWidth,
                      Math.min(w, chatMaxWidth) +
                        (e.key === "ArrowLeft" ? 20 : -20),
                    ),
                  ),
                );
              }
            }}
          >
            <span />
          </div>
        )}
        {!chatVisible && (
          <aside className="chat-collapsed" aria-label="Collapsed chat panel">
            <div className="panel-heading">
              <button
                className="chat-expand"
                aria-label="Expand chat panel"
                title="Expand chat panel"
                aria-controls="model-chat"
                aria-expanded={false}
                onClick={() => setChatVisible(true)}
              >
                <PanelRightOpen size={17} />
              </button>
            </div>
          </aside>
        )}
        <div
          id="model-chat"
          className="chat-slot"
          hidden={!chatVisible}
          style={{ width: Math.min(chatWidth, chatMaxWidth) }}
        >
          <ChatPanel
            key={model?.id ?? "no-model"}
            controller={review}
            bridgeStatus={bridgeStatus}
            context={context}
            onEvent={aiEvent}
            visible={chatVisible}
            onHide={() => setChatVisible(false)}
          />
        </div>
      </div>
    </div>
  );
}
