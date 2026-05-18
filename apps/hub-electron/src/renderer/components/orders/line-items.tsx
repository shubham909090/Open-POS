import { formatInr } from "@gaurav-pos/shared";
import type { ReactNode } from "react";
import { EmptyState } from "../ui/empty-state.js";

export function LineItems({
  rows,
  emptyTitle,
  emptyText,
}: {
  rows: Array<{
    id: string;
    title: string;
    meta: string;
    quantity: number;
    amount: number;
    onMinus?: () => void;
    onPlus?: () => void;
    note?: string;
    onNoteChange?: (note: string) => void;
    action?: ReactNode;
  }>;
  emptyTitle: string;
  emptyText: string;
}) {
  if (!rows.length)
    return <EmptyState title={emptyTitle} description={emptyText} />;

  return (
    <div className="line-list">
      {rows.map((row) => (
        <article key={row.id} className="line-row">
          <div className="line-main">
            <strong>{row.title}</strong>
            <span>{row.meta}</span>
          </div>
          <strong className="line-amount">{formatInr(row.amount)}</strong>
          <div className={row.onMinus || row.onPlus ? "qty-cluster" : "qty-cluster qty-readonly"}>
            {row.onMinus ? (
              <button type="button" onClick={row.onMinus}>
                -
              </button>
            ) : null}
            <b>{row.quantity}<span aria-hidden="true"> x</span></b>
            {row.onPlus ? (
              <button type="button" onClick={row.onPlus}>
                +
              </button>
            ) : null}
          </div>
          {row.onNoteChange ? (
            <details className="line-note-field" open={Boolean(row.note?.trim())}>
              <summary>{row.note?.trim() ? "Edit item note" : "Add item note"}</summary>
              <input
                value={row.note ?? ""}
                onChange={(event) => row.onNoteChange?.(event.target.value)}
                maxLength={500}
                placeholder="Kitchen/bar note"
              />
            </details>
          ) : row.note ? (
            <p className="line-note-text">{row.note}</p>
          ) : null}
          {row.action ? <div className="line-row-action">{row.action}</div> : null}
        </article>
      ))}
    </div>
  );
}
