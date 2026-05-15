import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils.js";

export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg border border-line bg-panel p-4", className)}
      {...props}
    />
  )
);
Panel.displayName = "Panel";
