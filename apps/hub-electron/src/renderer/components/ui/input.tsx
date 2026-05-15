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
          "h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
          error && "border-red-400 focus:border-red-600 focus:ring-red-600/20",
          className
        )}
        {...props}
      />
    );

    if (!label && !hint && !error) return input;

    return (
      <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
        {label ? <span>{label}</span> : null}
        {input}
        {error ? <span className="text-xs font-medium text-red-700">{error}</span> : hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </label>
    );
  }
);

Input.displayName = "Input";
