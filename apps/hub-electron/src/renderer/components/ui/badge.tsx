import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700",
        className
      )}
      {...props}
    />
  );
}
