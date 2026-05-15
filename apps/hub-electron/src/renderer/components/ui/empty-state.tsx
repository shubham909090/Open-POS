import { type ReactNode } from "react";
import { cn } from "../../lib/utils.js";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid place-items-center gap-2 rounded-lg border border-dashed border-line p-8 text-center", className)}>
      {icon ? <div className="text-muted">{icon}</div> : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-xs text-xs text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
