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
          <strong className="line-amount">{formatInr(row.amount)}</strong>
          {row.action ? <div className="line-row-action">{row.action}</div> : null}
        </article>
      ))}
    </div>
  );
}
