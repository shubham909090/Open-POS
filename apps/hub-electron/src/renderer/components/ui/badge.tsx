import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

const badgeVariants = cva("ui-badge", {
  variants: { variant: { default: "", accent: "ui-badge-accent", warning: "ui-badge-warning", danger: "ui-badge-danger", blue: "ui-badge-blue", solid: "ui-badge-solid" } },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
