import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils.js";

export const Card = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(({ className, ...props }, ref) => (
  <section ref={ref} className={cn("rounded-lg border border-line bg-panel shadow-pos", className)} {...props} />
));
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex min-w-0 items-start justify-between gap-3 border-b border-line px-4 py-3", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn("text-base font-semibold leading-6 text-ink", className)} {...props} />
));
CardTitle.displayName = "CardTitle";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-4 py-4", className)} {...props} />
));
CardContent.displayName = "CardContent";
