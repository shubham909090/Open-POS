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
          "ui-input",
          error && "ui-input-invalid",
          className
        )}
        {...props}
      />
    );

    if (!label && !hint && !error) return input;

    return (
      <label htmlFor={inputId} className="ui-field">
        {label ? <span>{label}</span> : null}
        {input}
        {error ? <span id={descriptionId} className="ui-field-error">{error}</span> : hint ? <span id={descriptionId} className="ui-field-help">{hint}</span> : null}
      </label>
    );
  }
);

Input.displayName = "Input";
