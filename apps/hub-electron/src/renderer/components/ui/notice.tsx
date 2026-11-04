import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

const noticeVariants = cva("ui-notice", {
  variants: { variant: { info: "", success: "ui-notice-success", warning: "ui-notice-warning", error: "ui-notice-error" } },
  defaultVariants: { variant: "info" },
});

export interface NoticeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof noticeVariants> {}

export function Notice({ className, variant, ...props }: NoticeProps) {
  return <div role={variant === "error" ? "alert" : "status"} className={cn(noticeVariants({ variant }), className)} {...props} />;
}
