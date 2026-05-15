import { type ReactNode } from "react";
import { cn } from "../../lib/utils.js";

export function Metric({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-0.5 rounded-lg border border-line bg-panel px-4 py-3", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-lg font-bold tabular-nums text-ink">{value}</span>
      {sub ? <span className="text-xs text-muted">{sub}</span> : null}
    </div>
  );
}
