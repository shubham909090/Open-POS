import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      status: {
        free: "bg-wash text-muted",
        running: "bg-warning-soft text-warning",
        billed: "bg-blue-soft text-blue",
        paid: "bg-accent-soft text-accent-dark",
        cancelled: "bg-danger-soft text-danger",
        pending: "bg-warning-soft text-warning",
        failed: "bg-danger-soft text-danger",
        active: "bg-accent-soft text-accent-dark",
        disabled: "bg-wash text-muted",
      },
    },
    defaultVariants: {
      status: "free",
    },
  }
);

export interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ status, dot = false, children, className }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ status }), className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
