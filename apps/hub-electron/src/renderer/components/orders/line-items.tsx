import { formatInr } from "@gaurav-pos/shared";
import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { EmptyState } from "../ui/empty-state.js";
import { CategoryBadge } from "./menu-card.js";

export function LineItems({
  rows,
  emptyTitle,
  emptyText,
}: {
  rows: Array<{
    id: string;
    title: string;
    meta: string;
    punch?: string;
    saleGroupKind?: string;
    saleGroupName?: string;
    quantity: number;
    amount: number;
    onMinus?: () => void;
    onPlus?: () => void;
    onRemove?: () => void;
    note?: string;
    onNoteChange?: (note: string) => void;
    /** Unsaved edit against what the kitchen already has. */
    changed?: boolean;
    action?: ReactNode;
  }>;
  emptyTitle: string;
  emptyText: string;
}) {
  if (!rows.length)
    return <EmptyState title={emptyTitle} description={emptyText} />;

  return (
    <div className="line-list">
      {rows.map((row) => {
        const editable = Boolean(row.onMinus || row.onPlus);
        return (
          <article key={row.id} className={`line-row${row.quantity === 0 ? " removed" : ""}${row.changed ? " changed" : ""}`}>
            {row.saleGroupKind ? <CategoryBadge kind={row.saleGroupKind} className={`line-category-icon category-${row.saleGroupKind}`} /> : null}
            <div className="line-main">
              <strong className="line-title">{row.title}</strong>
              <div className="line-metadata">
                <span>{row.meta}</span>
                {row.punch ? <small className="line-punch">{row.punch}</small> : null}
              </div>
            </div>
            <div className={`${editable ? "qty-cluster" : "qty-cluster qty-readonly"}${row.onRemove ? " has-remove" : ""}`}>
              {row.onMinus ? (
                <button type="button" onClick={row.onMinus} aria-label={`Decrease ${row.title}`}>
                  −
                </button>
              ) : null}
              <b>{editable ? row.quantity : `${row.quantity}×`}</b>
              {row.onPlus ? (
                <button type="button" onClick={row.onPlus} aria-label={`Increase ${row.title}`}>
                  +
                </button>
              ) : null}
              {row.onRemove ? (
                <button type="button" className="remove-line-button" onClick={row.onRemove} disabled={row.quantity === 0} aria-label={`Remove ${row.title}`} title="Remove item">
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <strong className="line-amount">{formatInr(row.amount)}</strong>
            {row.onNoteChange ? (
              <details className="line-note-field" open={Boolean(row.note?.trim())}>
                <summary>{row.note?.trim() ? "Note" : "Add note"}</summary>
                <input
                  value={row.note ?? ""}
                  onChange={(event) => row.onNoteChange?.(event.target.value)}
                  maxLength={500}
                  aria-label={`Kitchen note for ${row.title}`}
                  placeholder="Kitchen/bar note"
                />
              </details>
            ) : row.note ? (
              <p className="line-note-text">{row.note}</p>
            ) : null}
            {row.action ? <div className="line-row-action">{row.action}</div> : null}
          </article>
        );
      })}
    </div>
  );
}
