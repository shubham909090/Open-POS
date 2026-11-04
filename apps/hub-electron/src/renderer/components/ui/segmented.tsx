import { cn } from "../../lib/utils.js";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("ui-segmented", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "ui-segmented-item",
            value === opt.value
              ? "active"
              : ""
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
