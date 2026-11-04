import { Fragment, type ReactNode, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pencil, Trash2, X } from "lucide-react";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import { EmptyState } from "../ui/empty-state.js";
import { ConfirmationDialog } from "../ui/confirmation-dialog.js";

export type RecordTone = "running" | "billed" | "muted";

/**
 * Saved setup records. "rows" is a dense one-line list for long catalogs;
 * "tiles" packs short-named records (tables) into a grid so a 50-table floor
 * fits on one screen. Both expose the same edit / enable / delete actions.
 */
export function EditableRecordList({
  setNotice,
  rows,
  hideSearch = false,
  emptyMessage,
  layout = "rows",
}: {
  setNotice: NoticeSetter;
  rows: Array<{
    id: string;
    title: string;
    meta: string;
    /** Right-aligned value column, e.g. a price. */
    aside?: string;
    /** Live state shown as a coloured marker (tiles). */
    tone?: RecordTone;
    active: boolean;
    onToggle: () => Promise<unknown>;
    onDelete: () => Promise<unknown>;
    /** The action already opens its own approval dialog. */
    deleteApproval?: boolean;
    onMoveUp?: () => Promise<unknown>;
    onMoveDown?: () => Promise<unknown>;
    moveUpDisabled?: boolean;
    moveDownDisabled?: boolean;
    editForm: (close: () => void) => ReactNode;
  }>;
  hideSearch?: boolean;
  emptyMessage?: string;
  layout?: "rows" | "tiles";
}) {
  const tiles = layout === "tiles";
  const [busyId, setBusyId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(60);
  const [deleting, setDeleting] = useState<(typeof rows)[number] | null>(null);
  const needle = search.trim().toLowerCase();
  const matchedRows = rows.filter((row) => {
    if (!needle) return true;
    return [row.title, row.meta].some((part) =>
      part.toLowerCase().includes(needle),
    );
  });
  const visibleRows = matchedRows.slice(0, limit);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
      setNotice({ tone: "good", text: "Saved." });
      return true;
    } catch (error) {
      if (error !== undefined) setNotice({ tone: "bad", text: messageOf(error) });
      return false;
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="record-list">
      {!hideSearch && rows.length > 12 ? (
        <div className="setup-search-row">
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setLimit(60); }}
            aria-label="Search saved records"
            placeholder="Search saved records"
          />
        </div>
      ) : null}
      <div className={tiles ? "record-tiles" : "record-rows"}>
      {visibleRows.map((row) => {
        const editing = editingId === row.id;
        const busy = busyId === row.id;
        const hasMove = Boolean(row.onMoveUp || row.onMoveDown);
        const moveControls = hasMove ? (
          <div className="record-move-controls" aria-label={`Move ${row.title}`}>
            <button
              type="button"
              className="record-action icon-only"
              disabled={busy || row.moveUpDisabled || !row.onMoveUp}
              onClick={() => row.onMoveUp && void run(row.id, row.onMoveUp)}
              aria-label={`Move ${row.title} ${tiles ? "earlier" : "up"}`}
              title={tiles ? "Move earlier" : "Move up"}
            >
              {tiles ? <ArrowLeft size={14} /> : <ArrowUp size={15} />}
            </button>
            <button
              type="button"
              className="record-action icon-only"
              disabled={busy || row.moveDownDisabled || !row.onMoveDown}
              onClick={() => row.onMoveDown && void run(row.id, row.onMoveDown)}
              aria-label={`Move ${row.title} ${tiles ? "later" : "down"}`}
              title={tiles ? "Move later" : "Move down"}
            >
              {tiles ? <ArrowRight size={14} /> : <ArrowDown size={15} />}
            </button>
          </div>
        ) : null;
        const actions = (
          <div className="row-actions">
            <button
              type="button"
              className={`record-action edit${editing ? " open" : ""}`}
              disabled={busy}
              aria-expanded={editing}
              aria-label={tiles ? `${editing ? "Close" : "Edit"} ${row.title}` : undefined}
              onClick={() => setEditingId((current) => (current === row.id ? "" : row.id))}
            >
              {editing ? <X size={14} /> : <Pencil size={14} />}
              {editing ? "Close" : "Edit"}
            </button>
            <button
              type="button"
              className="record-action record-secondary-action"
              disabled={busy}
              onClick={() => void run(row.id, row.onToggle)}
            >
              {row.active ? "Disable" : "Enable"}
            </button>
            <button
              type="button"
              className="record-action danger icon-only record-secondary-action"
              disabled={busy}
              onClick={() => row.deleteApproval ? void run(row.id, row.onDelete) : setDeleting(row)}
              aria-label={`Delete ${row.title}`}
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        );
        const className = [
          tiles ? "record-tile" : "record-row",
          hasMove ? "has-move-controls" : "",
          editing ? "editing" : "",
          row.active ? "" : "inactive",
          row.tone ? `tone-${row.tone}` : "",
        ].filter(Boolean).join(" ");
        if (tiles) {
          return (
            <Fragment key={row.id}>
              <article className={className}>
                <button
                  type="button"
                  className="record-tile-open"
                  aria-expanded={editing}
                  aria-label={`${editing ? "Close" : "Edit"} ${row.title}`}
                  disabled={busy}
                  onClick={() => setEditingId((current) => (current === row.id ? "" : row.id))}
                >
                  <strong title={row.title}>{row.title}</strong>
                  <span className="record-tile-meta">
                    {!row.active ? <span className="record-status disabled">Disabled</span> : row.meta}
                  </span>
                </button>
                {moveControls}
              </article>
              {editing ? (
                <div className="record-tile-editor" role="group" aria-label={`Edit ${row.title}`}>
                  <header>
                    <strong>{row.title}</strong>
                    <span>{row.active ? row.meta : "Disabled"}</span>
                    <div className="row-actions">
                      <button type="button" className="record-action" disabled={busy} onClick={() => void run(row.id, row.onToggle)}>
                        {row.active ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="record-action danger"
                        disabled={busy}
                        onClick={() => row.deleteApproval ? void run(row.id, row.onDelete) : setDeleting(row)}
                        aria-label={`Delete ${row.title}`}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                      <button type="button" className="record-action icon-only" onClick={() => setEditingId("")} aria-label={`Close ${row.title}`}>
                        <X size={15} />
                      </button>
                    </div>
                  </header>
                  {row.editForm(() => setEditingId(""))}
                </div>
              ) : null}
            </Fragment>
          );
        }
        return (
          <article key={row.id} className={className}>
            <div className="record-row-main">
              <strong>{row.title}</strong>
              {!row.active ? <span className="record-status disabled">Disabled</span> : null}
              {row.meta ? <span>{row.meta}</span> : null}
            </div>
            {row.aside !== undefined ? <span className="record-aside">{row.aside}</span> : null}
            {moveControls}
            {actions}
            {editing ? row.editForm(() => setEditingId("")) : null}
          </article>
        );
      })}
      </div>
      {matchedRows.length > visibleRows.length ? <div className="record-pagination"><span>Showing {visibleRows.length} of {matchedRows.length} records</span><button type="button" className="secondary-button compact" onClick={() => setLimit((current) => current + 60)}>Show {Math.min(60, matchedRows.length - visibleRows.length)} more</button></div> : null}
      {!rows.length ? (
        <EmptyState
          title={emptyMessage ?? "Nothing added yet"}
          description={
            emptyMessage ? "" : "Saved records appear here immediately."
          }
        />
      ) : rows.length > 0 && visibleRows.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Clear search or try another name."
        />
      ) : null}
      <ConfirmationDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.title ?? "record"}?`}
        message="Remove this record from restaurant setup? The hub will keep any information required by existing orders and bills."
        confirmLabel={busyId ? "Deleting…" : "Delete record"}
        danger
        busy={Boolean(busyId)}
        onCancel={() => {
          if (!busyId) setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting || busyId) return;
          void run(deleting.id, deleting.onDelete).then((saved) => {
            if (saved) setDeleting(null);
          });
        }}
      />
    </div>
  );
}
