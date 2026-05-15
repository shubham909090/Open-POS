import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { type ReactNode } from "react";
import { Button, type ButtonProps } from "./button.js";

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  cancel = "Cancel",
  confirm,
  confirmVariant = "danger",
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  cancel?: string;
  confirm: string;
  confirmVariant?: ButtonProps["variant"];
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/55 backdrop-blur-sm" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-danger/30 bg-panel p-5 shadow-2xl outline-none">
          <AlertDialogPrimitive.Title className="text-lg font-semibold text-ink">
            {title}
          </AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className="text-sm text-muted">
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}
          {children}
          <div className="flex items-center justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary">{cancel}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant={confirmVariant} onClick={onConfirm}>{confirm}</Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
