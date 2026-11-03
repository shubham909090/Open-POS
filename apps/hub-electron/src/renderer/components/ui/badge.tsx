import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

const badgeVariants = cva(
  "inline-flex min-h-5 items-center rounded-md px-2 py-0.5 text-[11px] font-medium leading-4",
  {
    variants: {
      variant: {
        default: "border border-line bg-wash text-muted",
        accent: "bg-accent-soft text-accent-dark",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        blue: "bg-blue-soft text-blue",
        solid: "bg-ink text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
