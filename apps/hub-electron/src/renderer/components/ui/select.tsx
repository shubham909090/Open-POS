import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../../lib/utils.js";

export function Select({
  value,
  onValueChange,
  placeholder,
  children,
  label,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const control = (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-line bg-panel px-3 text-left text-sm text-ink shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown size={16} className="text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-line bg-panel shadow-xl">
          <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );

  if (!label) return control;
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-muted">
      <span>{label}</span>
      {control}
    </label>
  );
}

export function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <SelectPrimitive.Item
      value={value}
      className="relative flex cursor-default select-none items-center rounded-sm py-2 pl-8 pr-3 text-sm text-ink outline-none data-[highlighted]:bg-wash"
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center">
        <Check size={15} />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
