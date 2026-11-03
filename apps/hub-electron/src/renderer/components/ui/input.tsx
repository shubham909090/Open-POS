import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils.js";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const descriptionId = `${inputId}-help`;
    const input = (
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? descriptionId : undefined}
        ref={ref}
        className={cn(
          "h-9 w-full min-w-0 rounded-md border border-line-strong bg-panel px-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted",
          error && "border-danger focus:border-danger focus:ring-danger",
          className
        )}
        {...props}
      />
    );

    if (!label && !hint && !error) return input;

    return (
      <label htmlFor={inputId} className="grid min-w-0 gap-1.5 text-sm font-medium text-ink">
        {label ? <span>{label}</span> : null}
        {input}
        {error ? <span id={descriptionId} className="text-xs font-normal text-danger">{error}</span> : hint ? <span id={descriptionId} className="text-xs font-normal text-muted">{hint}</span> : null}
      </label>
    );
  }
);

Input.displayName = "Input";
