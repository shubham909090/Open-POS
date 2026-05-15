import { Minus, Plus } from "lucide-react";
import { cn } from "../../lib/utils.js";

export function QtyCluster({
  value,
  onChange,
  min = 0,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-0 rounded-md border border-line", className)}>
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-l-md text-muted transition hover:bg-wash hover:text-ink disabled:opacity-40"
      >
        <Minus size={14} />
      </button>
      <span className="flex h-8 min-w-[2rem] items-center justify-center border-x border-line bg-panel px-1 text-sm font-bold tabular-nums text-ink">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-r-md text-muted transition hover:bg-wash hover:text-ink"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
