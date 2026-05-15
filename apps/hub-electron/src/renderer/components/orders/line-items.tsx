import { formatInr } from "@gaurav-pos/shared";
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
          <div>
            <strong>{row.title}</strong>
            <span>{row.meta}</span>
          </div>
          <div className="qty-cluster">
            {row.onMinus ? (
              <button type="button" onClick={row.onMinus}>
                -
              </button>
            ) : null}
            <b>{row.quantity}</b>
            {row.onPlus ? (
              <button type="button" onClick={row.onPlus}>
                +
              </button>
            ) : null}
          </div>
          <strong>{formatInr(row.amount)}</strong>
        </article>
      ))}
    </div>
  );
}
