import type { InputHTMLAttributes } from "react";

export function AlcoholNumberField({ label, unit, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; unit: "ml" | "₹" }) {
  return <label>{label}<span className={`unit-input${unit === "₹" ? " prefix" : ""}`}>
    {unit === "₹" ? <i aria-hidden="true">₹</i> : null}
    <input inputMode={unit === "₹" ? "decimal" : "numeric"} {...input} />
    {unit === "ml" ? <i aria-hidden="true">ml</i> : null}
  </span></label>;
}
