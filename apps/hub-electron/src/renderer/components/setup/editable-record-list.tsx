import { type ReactNode, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2, X } from "lucide-react";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import { EmptyState } from "../ui/empty-state.js";
import { ConfirmationDialog } from "../ui/confirmation-dialog.js";

export function EditableRecordList({
  setNotice,
  rows,
  hideSearch = false,
  emptyMessage,
}: {
  setNotice: NoticeSetter;
  rows: Array<{
    id: string;
    title: string;
    meta: string;
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
}) {
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
      {visibleRows.map((row) => (
        <article
          key={row.id}
          className={`record-row${row.onMoveUp || row.onMoveDown ? " has-move-controls" : ""}${editingId === row.id ? " editing" : ""}`}
        >
          <div className="record-row-main">
            <div className="record-row-title">
              <strong>{row.title}</strong>
              {!row.active ? <span className="record-status disabled">Disabled</span> : null}
            </div>
            <span>{row.meta}</span>
          </div>
          {row.onMoveUp || row.onMoveDown ? (
            <div
              className="record-move-controls"
              aria-label={`Move ${row.title}`}
            >
              <button
                type="button"
                className="record-action icon-only"
                disabled={
                  busyId === row.id || row.moveUpDisabled || !row.onMoveUp
                }
                onClick={() => row.onMoveUp && void run(row.id, row.onMoveUp)}
                aria-label={`Move ${row.title} up`}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                className="record-action icon-only"
                disabled={
                  busyId === row.id || row.moveDownDisabled || !row.onMoveDown
                }
                onClick={() =>
                  row.onMoveDown && void run(row.id, row.onMoveDown)
                }
                aria-label={`Move ${row.title} down`}
              >
                <ArrowDown size={15} />
              </button>
            </div>
          ) : null}
          <div className="row-actions">
            <button
              type="button"
              className="record-action"
              disabled={busyId === row.id}
              onClick={() =>
                setEditingId((current) => (current === row.id ? "" : row.id))
              }
            >
              {editingId === row.id ? <X size={15} /> : <Pencil size={15} />}
              {editingId === row.id ? "Close" : "Edit"}
            </button>
            <button
              type="button"
              className="record-action"
              disabled={busyId === row.id}
              onClick={() => void run(row.id, row.onToggle)}
            >
              {row.active ? "Disable" : "Enable"}
            </button>
            <button
              type="button"
              className="record-action danger icon-only"
              disabled={busyId === row.id}
              onClick={() => row.deleteApproval ? void run(row.id, row.onDelete) : setDeleting(row)}
              aria-label={`Delete ${row.title}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {editingId === row.id ? row.editForm(() => setEditingId("")) : null}
        </article>
      ))}
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
