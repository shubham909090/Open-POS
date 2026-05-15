import { forwardRef, type TextareaHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils.js";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: ReactNode;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const textarea = (
      <textarea
        id={id}
        ref={ref}
        className={cn(
          "w-full min-w-0 rounded-md border border-line-strong bg-panel px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted",
          error && "border-danger focus:border-danger focus:ring-danger/20",
          className
        )}
        {...props}
      />
    );

    if (!label && !error) return textarea;

    return (
      <label className="grid min-w-0 gap-1.5 text-sm font-medium text-muted">
        {label ? <span>{label}</span> : null}
        {textarea}
        {error ? <span className="text-xs font-medium text-danger">{error}</span> : null}
      </label>
    );
  }
);

Textarea.displayName = "Textarea";
