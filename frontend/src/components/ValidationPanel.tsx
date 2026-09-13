import { useRef, useState } from "react";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import {
  api,
  json,
  upload,
  type Model,
  type Schedule,
  type Workbook,
  type Report,
  type Action,
} from "../lib/api";
import {
  suggestSchedule,
  mappingError,
  scheduleHeaders,
} from "../lib/schedule";
export function ValidationPanel({
  book,
  onBook,
  model,
  schedule,
  onSchedule,
  report,
  onReport,
  onAction,
  onSelect,
}: {
  book: Workbook | undefined;
  onBook(book: Workbook): void;
  model: Model | null;
  schedule: Schedule | null;
  onSchedule(s: Schedule | null): void;
  report: Report | null;
  onReport(r: Report | null): void;
  onAction(a: Action): void;
  onSelect(guid: string): void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef(model);
  current.current = model;
  const issue = mappingError(book, schedule);
  const headers = book && schedule ? scheduleHeaders(book, schedule) : [];
  function mapping(s: Schedule) {
    setError("");
    onSchedule(s);
    onReport(null);
  }
  async function load(file: File) {
    setBusy(true);
    setError("");
    try {
      const b = await upload<Workbook>("/workbooks", file);
      onBook(b);
      mapping(suggestSchedule(b));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!model || !schedule || issue) return;
    const identity = model;
    setBusy(true);
    setError("");
    try {
      const r = await api<Report>(
        "/validations",
        json({
          model_id: model.id,
          model_revision: model.model_revision,
          schedule,
        }),
      );
      if (current.current?.id === identity.id) onReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function isolate() {
    if (!model || !report) return;
    const guids = report.findings
      .filter((f) => f.status === "fail")
      .map((f) => f.GlobalId);
    if (guids.length)
      for (const action of ["isolate", "frame"] as const)
        onAction({
          model_id: model.id,
          model_revision: model.model_revision,
          action,
          guids,
        });
  }
  return (
    <>
      <section className="workbook-panel" aria-label="Excel workbook">
        <div className="workbook-bar">
          <span className="workbook-icon">
            <FileSpreadsheet size={20} />
          </span>
          <div className="workbook-identity">
            <strong title={book?.filename}>
              {book
                ? book.filename || "Excel workbook"
                : "Connect an Excel workbook"}
            </strong>
            <span>
              {book
                ? `${book.sheets.length} worksheets · Available to your AI assistant`
                : "Add a reference, classification workbook, or material schedule"}
            </span>
          </div>
          {book && (
            <span className="workbook-linked">
              <CheckCircle2 size={13} /> Linked
            </span>
          )}
          <button
            className="workbook-upload"
            disabled={busy || !model}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={14} />
            {busy ? "Working…" : book ? "Replace file" : "Upload Excel"}
          </button>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept=".xlsx"
            aria-label="Upload Excel workbook"
            disabled={busy || !model}
            onChange={(e) => {
              if (e.target.files?.[0]) void load(e.target.files[0]);
              e.target.value = "";
            }}
          />
          {book && (
            <button
              className={`mapping-toggle ${showMapping ? "active" : ""}`}
              aria-expanded={showMapping}
              aria-controls="material-mapping"
              onClick={() => setShowMapping(!showMapping)}
            >
              <SlidersHorizontal size={14} />
              Material check
              <ChevronDown size={13} />
            </button>
          )}
        </div>
        {book && !showMapping && (
          <p className="workbook-hint">
            Ask the assistant about this workbook. To compare expected materials
            with the model, set up a material check.
          </p>
        )}
        {book && schedule && showMapping && (
          <div id="material-mapping" className="material-mapping">
            <div className="mapping-intro">
              <strong>Compare materials with your model</strong>
              <span>
                Select the worksheet and columns containing IFC Global IDs and
                expected materials.
              </span>
            </div>
            <div className="schedule-controls">
              <label>
                Schedule worksheet
                <select
                  value={schedule.sheet}
                  onChange={(e) =>
                    mapping(suggestSchedule(book, e.target.value))
                  }
                >
                  {book.sheets.map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Header row
                <input
                  type="number"
                  min="1"
                  value={schedule.header_row}
                  onChange={(e) =>
                    mapping({ ...schedule, header_row: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                IFC Global ID
                <input
                  list="schedule-column-options"
                  placeholder="Choose Global ID header"
                  value={schedule.guid_column}
                  onChange={(e) =>
                    mapping({ ...schedule, guid_column: e.target.value })
                  }
                />
              </label>
              <label>
                Expected material
                <input
                  list="schedule-column-options"
                  placeholder="Choose expected material header"
                  value={schedule.material_column}
                  onChange={(e) =>
                    mapping({ ...schedule, material_column: e.target.value })
                  }
                />
              </label>
              <datalist id="schedule-column-options">
                {[...new Set(headers)].map((header) => (
                  <option key={header} value={header} />
                ))}
              </datalist>
              <button
                disabled={busy || !model || !!issue}
                onClick={() => void check()}
              >
                {busy ? "Checking…" : "Check materials"}
              </button>
            </div>
            <p
              className={`mapping-feedback ${issue ? "" : "ready"}`}
              role="status"
            >
              {issue
                ? !schedule.guid_column || !schedule.material_column
                  ? "Select both columns to enable the check. General Excel questions are already available in chat."
                  : issue
                : "Mapping ready. You can now check materials."}
            </p>
          </div>
        )}
        {report && (
          <div className="workbook-results">
            <span>
              {report.counts.pass ?? 0} pass · {report.counts.fail ?? 0} fail ·{" "}
              {report.counts.unknown ?? 0} unknown ·{" "}
              {report.uncovered_door_guids.length} uncovered
            </span>
            <button onClick={isolate}>Isolate failures</button>
            <a href={`/api/v1/validations/${report.id}?format=csv`}>
              Export CSV
            </a>
            <button onClick={() => onReport(null)}>Model rows</button>
          </div>
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Status",
                  "Global ID",
                  "Actual material",
                  "Expected material",
                  "Reason",
                  "Source row",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.findings.map((f, i) => (
                <tr
                  key={i}
                  onClick={() => {
                    if (
                      !["entity_not_found", "missing_global_id"].includes(
                        f.reason,
                      )
                    )
                      onSelect(f.GlobalId);
                  }}
                >
                  <td>{f.status}</td>
                  <td className="mono">{f.GlobalId}</td>
                  <td>{f.actual.join(", ") || "Missing"}</td>
                  <td>{f.expected}</td>
                  <td>{f.reason}</td>
                  <td>
                    {f.source.sheet}:{f.source.row}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
