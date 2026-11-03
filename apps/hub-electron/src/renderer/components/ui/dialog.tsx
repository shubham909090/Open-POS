import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type KeyboardEventHandler, type ReactNode } from "react";
import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  danger = false,
  size = "default",
  onKeyDown,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  danger?: boolean;
  size?: "default" | "wide";
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            "dialog-surface fixed left-1/2 top-1/2 z-50 grid max-h-[86dvh] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-xl border bg-panel p-6 shadow-pos-lg outline-none",
            size === "wide"
              ? "w-[min(980px,calc(100vw-32px))]"
              : "w-[min(560px,calc(100vw-32px))]",
            danger ? "border-danger/30" : "border-line",
          )}
          onKeyDown={onKeyDown}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <div className="flex items-center justify-between gap-4">
            <DialogPrimitive.Title className="text-lg font-semibold text-ink">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {title}
            </DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
              >
                <X size={18} />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
