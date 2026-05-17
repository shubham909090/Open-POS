import { type ReactNode, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
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
    editForm: (close: () => void) => ReactNode;
  }>;
}) {
  const [busyId, setBusyId] = useState("");
  const [editingId, setEditingId] = useState("");

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
      {rows.map((row) => (
        <article
          key={row.id}
          className={`record-row${editingId === row.id ? " editing" : ""}`}
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
      ) : null}
    </div>
  );
}
