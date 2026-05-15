import { type ReactNode } from "react";
import { cn } from "../../lib/utils.js";

export function DataRow({
  label,
  value,
  actions,
  sub,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  actions?: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3 border-b border-line px-1 py-2.5 last:border-b-0", className)}>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-medium text-ink">{label}</span>
        {sub ? <span className="truncate text-xs text-muted">{sub}</span> : null}
      </div>
      {value ? <span className="shrink-0 text-sm tabular-nums text-muted">{value}</span> : null}
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}
