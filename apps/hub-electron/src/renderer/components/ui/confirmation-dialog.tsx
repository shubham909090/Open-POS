import { Dialog } from "./dialog.js";
import { Button } from "./button.js";

export function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }} title={title} danger={danger}>
      <p className="text-sm text-muted">{message}</p>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button type="button" variant={danger ? "danger" : "accent"} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
