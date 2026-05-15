import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

const noticeVariants = cva(
  "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        info: "border-line bg-wash text-ink",
        success: "border-accent/30 bg-accent-soft text-accent-dark",
        warning: "border-warning/30 bg-warning-soft text-warning",
        error: "border-danger/30 bg-danger-soft text-danger",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

export interface NoticeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof noticeVariants> {}

export function Notice({ className, variant, ...props }: NoticeProps) {
  return <div role="alert" className={cn(noticeVariants({ variant }), className)} {...props} />;
}
