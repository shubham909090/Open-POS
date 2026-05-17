import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const input = (
      <input
        type="checkbox"
        id={id}
        ref={ref}
        className={cn(
          "h-4 w-4 rounded border-line text-accent accent-accent focus:ring-2 focus:ring-accent",
          className
        )}
        {...props}
      />
    );

    if (!label) return input;

    return (
      <label className="inline-flex items-center gap-2 text-sm text-ink">
        {input}
        <span>{label}</span>
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
