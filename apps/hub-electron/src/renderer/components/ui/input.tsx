import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils.js";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const input = (
      <input
        id={id}
        ref={ref}
        className={cn(
          "h-10 w-full min-w-0 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted",
          error && "border-danger focus:border-danger focus:ring-danger",
          className
        )}
        {...props}
      />
    );

    if (!label && !hint && !error) return input;

    return (
      <label className="grid min-w-0 gap-1.5 text-sm font-medium text-muted">
        {label ? <span>{label}</span> : null}
        {input}
        {error ? <span className="text-xs font-medium text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </label>
    );
  }
);

Input.displayName = "Input";
