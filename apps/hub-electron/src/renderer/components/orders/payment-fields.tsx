import type { Dispatch, SetStateAction } from "react";

export const PAYMENT_LABELS = { cash: "Cash", upi: "UPI", card: "Card", online: "Online" } as const;
export type PaymentMethod = keyof typeof PAYMENT_LABELS;

/** Method chips fill the outstanding balance; explicit amounts preserve split tender. */
export function PaymentFields({ payments, setPayments, fillRemaining, labelPrefix = "", autoFocus = false }: {
  payments: Record<PaymentMethod, string>;
  setPayments: Dispatch<SetStateAction<Record<PaymentMethod, string>>>;
  fillRemaining: (method: PaymentMethod) => void;
  labelPrefix?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="payment-grid">
      {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => (
        <div key={method} className={`payment-row${Number(payments[method] || 0) > 0 ? " filled" : ""}`}>
          <button
            type="button"
            className="payment-method"
            aria-label={`Fill remaining into ${labelPrefix}${method}`}
            title={`Fill remaining into ${PAYMENT_LABELS[method]}`}
            onClick={() => fillRemaining(method)}
          >
            {PAYMENT_LABELS[method]}
          </button>
          <input
            aria-label={`${labelPrefix}${PAYMENT_LABELS[method]} amount`}
            value={payments[method]}
            autoFocus={autoFocus && method === "cash"}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            onChange={(event) => setPayments((current) => ({ ...current, [method]: event.target.value }))}
            inputMode="decimal"
          />
        </div>
      ))}
    </div>
  );
}

export function DiscountTypeControl({ value, onChange, label = "Discount type" }: {
  value: "amount" | "percent";
  onChange: (value: "amount" | "percent") => void;
  label?: string;
}) {
  return (
    <span className="discount-type-control" role="group" aria-label={label}>
      <button type="button" aria-pressed={value === "amount"} onClick={() => onChange("amount")} aria-label={`${label}: rupees`}>₹</button>
      <button type="button" aria-pressed={value === "percent"} onClick={() => onChange("percent")} aria-label={`${label}: percent`}>%</button>
    </span>
  );
}
