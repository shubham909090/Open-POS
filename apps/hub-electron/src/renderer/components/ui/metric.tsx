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
    <div className={cn("ui-metric", className)}>
      <span className="ui-metric-label">{label}</span>
      <span className="ui-metric-value">{value}</span>
      {sub ? <span className="ui-metric-sub">{sub}</span> : null}
    </div>
  );
}
