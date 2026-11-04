import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, type KeyboardEventHandler, type ReactNode } from "react";
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
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  danger?: boolean;
  size?: "default" | "wide";
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onCloseAutoFocus?: (event: Event) => void;
  className?: string;
}) {
  // Most POS dialogs are opened by an action rather than a Radix Trigger.
  // Preserve that exact action so keyboard users can continue where they were.
  const returnFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) return;
    const rememberFocus = () => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement !== document.body && !content.current?.contains(activeElement)) returnFocus.current = activeElement;
    };
    document.addEventListener("focusin", rememberFocus);
    return () => document.removeEventListener("focusin", rememberFocus);
  }, [open]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          ref={content}
          className={cn(
            "dialog-surface",
            size === "wide" && "dialog-wide",
            danger && "dialog-danger",
            className,
          )}
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            const target = returnFocus.current;
            if (!event.defaultPrevented && target?.isConnected && !target.closest("[hidden]")) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
        >
          <div className="dialog-heading">
            <DialogPrimitive.Title className="dialog-title">
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
