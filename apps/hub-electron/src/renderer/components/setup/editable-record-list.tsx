import { type ReactNode, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2, X } from "lucide-react";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import { EmptyState } from "../ui/empty-state.js";

export function EditableRecordList({
  setNotice,
  rows,
}: {
  setNotice: NoticeSetter;
  rows: Array<{
    id: string;
    title: string;
    meta: string;
    active: boolean;
    onToggle: () => Promise<unknown>;
    onDelete: () => Promise<unknown>;
    onMoveUp?: () => Promise<unknown>;
    onMoveDown?: () => Promise<unknown>;
    moveUpDisabled?: boolean;
    moveDownDisabled?: boolean;
    editForm: (close: () => void) => ReactNode;
  }>;
}) {
  const [busyId, setBusyId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const matchedRows = rows.filter((row) => {
      if (!needle) return true;
      return [row.title, row.meta].some((part) => part.toLowerCase().includes(needle));
    });
  const visibleRows = needle ? matchedRows.slice(0, 150) : matchedRows;
  const searchCapped = Boolean(needle && matchedRows.length > visibleRows.length);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
      setNotice({ tone: "good", text: "Saved." });
    } catch (error) {
      setNotice({ tone: "bad", text: messageOf(error) });
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="record-list">
      {rows.length > 12 ? (
        <div className="setup-search-row">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved records" />
          {searchCapped ? <small>Showing first {visibleRows.length} matches. Keep typing to narrow.</small> : null}
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
              <span className={`record-status${row.active ? " active" : " disabled"}`}>
                {row.active ? "Active" : "Disabled"}
              </span>
            </div>
            <span>{row.meta}</span>
          </div>
          {row.onMoveUp || row.onMoveDown ? (
            <div className="record-move-controls" aria-label={`Move ${row.title}`}>
              <button
                type="button"
                className="record-action icon-only"
                disabled={busyId === row.id || row.moveUpDisabled || !row.onMoveUp}
                onClick={() => row.onMoveUp && void run(row.id, row.onMoveUp)}
                aria-label={`Move ${row.title} up`}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                className="record-action icon-only"
                disabled={busyId === row.id || row.moveDownDisabled || !row.onMoveDown}
                onClick={() => row.onMoveDown && void run(row.id, row.onMoveDown)}
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
                setEditingId((current) =>
                  current === row.id ? "" : row.id,
                )
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
              onClick={() => void run(row.id, row.onDelete)}
              aria-label={`Delete ${row.title}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {editingId === row.id ? row.editForm(() => setEditingId("")) : null}
        </article>
      ))}
      {!rows.length ? (
        <EmptyState
          title="Nothing added yet"
          description="Saved records appear here immediately."
        />
      ) : rows.length > 0 && visibleRows.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Clear search or try another name."
        />
      ) : null}
    </div>
  );
}
