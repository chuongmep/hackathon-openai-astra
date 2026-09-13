import { useSyncExternalStore } from "react";
import { Plus, X, ArrowUpRight } from "lucide-react";
import type { ReviewController } from "../lib/review";
export function ReviewPanel({
  controller: c,
}: {
  controller: ReviewController;
}) {
  const s = useSyncExternalStore(c.subscribe, c.snapshot);
  function run(fn: () => void) {
    try {
      fn();
    } catch (e) {
      c.update({
        error: e instanceof Error ? e.message : "Unable to save review.",
      });
    }
  }
  if (!s.open) return null;
  return (
    <aside className="review-panel" aria-label="Design review">
      <div className="scene-properties-heading">
        <span>
          Design review <small>{s.issues.length}</small>
        </span>
        <button
          aria-label="Close design review"
          onClick={() => c.update({ open: false })}
        >
          <X size={17} />
        </button>
      </div>
      <div className="review-body">
        <p className="muted">
          Capture a concern with the exact view you’re reviewing.
        </p>
        {s.error && (
          <p role="alert" className="error">
            {s.error}
          </p>
        )}
        {s.draft ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => {
                c.submit();
              });
            }}
            className="issue-form"
          >
            <label>
              Issue title
              <input
                required
                maxLength={180}
                value={s.draft.title}
                onChange={(e) => c.draft({ title: e.target.value })}
                placeholder="What needs attention?"
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                maxLength={4000}
                value={s.draft.description}
                onChange={(e) => c.draft({ description: e.target.value })}
                placeholder="Describe the concern and next step…"
              />
            </label>
            <div className="issue-fields">
              <label>
                Severity
                <select
                  value={s.draft.severity}
                  onChange={(e) =>
                    c.draft({ severity: e.target.value as "low" })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                Assigned to
                <input
                  maxLength={100}
                  value={s.draft.assignedTo}
                  onChange={(e) => c.draft({ assignedTo: e.target.value })}
                  placeholder="Name or team"
                />
              </label>
            </div>
            <small>
              Viewpoint captured ·{" "}
              {s.draft.viewpoint?.selected
                ? `Element #${s.draft.viewpoint.selected}`
                : "Whole model"}
            </small>
            <div className="issue-form-actions">
              <button type="button" onClick={() => c.update({ draft: null })}>
                Discard
              </button>
              <button className="primary">Save issue</button>
            </div>
          </form>
        ) : (
          <button
            className="primary"
            disabled={!c.rows.length}
            onClick={() =>
              run(() => {
                c.draft();
              })
            }
          >
            <Plus size={16} /> New issue
          </button>
        )}
        <div className="issue-list">
          {[...s.issues].reverse().map((issue) => (
            <button
              key={issue.id}
              onClick={() =>
                run(() => {
                  c.show(issue.id);
                })
              }
            >
              <span>
                <small>
                  {issue.id} · {issue.severity} priority
                </small>
                <strong>{issue.title}</strong>
                <small>
                  {issue.assignedTo || "Unassigned"} ·{" "}
                  {new Date(issue.createdAt).toLocaleDateString()}
                </small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
        {!s.issues.length && !s.draft && (
          <p className="empty-copy">
            No issues yet. Select an element and create your first review.
          </p>
        )}
        <p className="fine-print">
          Saved in this browser · assignees are labels, no notifications
        </p>
      </div>
    </aside>
  );
}
