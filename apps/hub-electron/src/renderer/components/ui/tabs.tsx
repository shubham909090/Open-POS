import * as TabsPrimitive from "@radix-ui/react-tabs";
import { type ReactNode } from "react";
import { cn } from "../../lib/utils.js";

export function Tabs({ value, onValueChange, children, className }: { value: string; onValueChange: (value: string) => void; children: ReactNode; className?: string }) {
  return <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>{children}</TabsPrimitive.Root>;
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cn("inline-flex rounded-md border border-line bg-wash p-1", className)}>{children}</TabsPrimitive.List>;
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="rounded px-3 py-1.5 text-sm font-semibold text-muted data-[state=active]:bg-panel data-[state=active]:text-ink data-[state=active]:shadow-sm"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
