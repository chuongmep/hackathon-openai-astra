import { useRef, useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef(model);
  current.current = model;
  function mapping(s: Schedule) {
    onSchedule(s);
    onReport(null);
  }
  async function load(file: File) {
    setBusy(true);
    setError("");
    try {
      const b = await upload<Workbook>("/workbooks", file);
      onBook(b);
      const sheet =
        b.sheets.find((s) => s.preview[0]?.includes("ExpectedMaterial")) ??
        b.sheets[0];
      mapping({
        workbook_id: b.id,
        sheet: sheet.name,
        header_row: 1,
        guid_column: "GlobalId",
        material_column: "ExpectedMaterial",
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!model || !schedule) return;
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
      <div className="schedule-controls">
        <label className="schedule-upload">
          Upload schedule
          <input
            type="file"
            accept=".xlsx"
            disabled={busy || !model}
            onChange={(e) => {
              if (e.target.files?.[0]) void load(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
        {book && schedule && (
          <>
            <label>
              Worksheet
              <select
                value={schedule.sheet}
                onChange={(e) =>
                  mapping({ ...schedule, sheet: e.target.value })
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
              GUID column
              <input
                value={schedule.guid_column}
                onChange={(e) =>
                  mapping({ ...schedule, guid_column: e.target.value })
                }
              />
            </label>
            <label>
              Material column
              <input
                value={schedule.material_column}
                onChange={(e) =>
                  mapping({ ...schedule, material_column: e.target.value })
                }
              />
            </label>
            <button disabled={busy || !model} onClick={() => void check()}>
              {busy ? "Checking…" : "Check materials"}
            </button>
          </>
        )}
        {report && (
          <>
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
          </>
        )}
      </div>
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
