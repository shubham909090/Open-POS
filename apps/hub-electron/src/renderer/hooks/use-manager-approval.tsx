import { useState } from "react";
import { Dialog } from "../components/ui/dialog.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";

export type ManagerApproval = { pin: string; reason: string; approvedBy: string };

export type ManagerApprovalRequest = (options: {
  title: string;
  message?: string;
  defaultReason?: string;
  reasonLabel?: string;
  pinLabel?: string;
  requireReason?: boolean;
  confirmLabel?: string;
  danger?: boolean;
  approvedBy?: string;
}) => Promise<ManagerApproval>;

export type ManagerApprovalState = {
  open: boolean;
  title: string;
  message?: string;
  reason: string;
  reasonLabel: string;
  pinLabel: string;
  requireReason: boolean;
  confirmLabel: string;
  danger: boolean;
  approvedBy: string;
  pin: string;
  resolve?: (approval: ManagerApproval) => void;
  reject?: () => void;
};

export function useManagerApproval() {
  const [state, setState] = useState<ManagerApprovalState>({
    open: false,
    title: "",
    reason: "",
    reasonLabel: "Reason",
    pinLabel: "Manager PIN",
    requireReason: true,
    confirmLabel: "Approve",
    danger: false,
    approvedBy: "manager",
    pin: "",
  });

  const request: ManagerApprovalRequest = (options) =>
    new Promise((resolve, reject) => {
      setState({
        open: true,
        title: options.title,
        message: options.message,
        reason: options.defaultReason ?? "",
        reasonLabel: options.reasonLabel ?? "Reason",
        pinLabel: options.pinLabel ?? "Manager PIN",
        requireReason: options.requireReason ?? true,
        confirmLabel: options.confirmLabel ?? "Approve",
        danger: Boolean(options.danger),
        approvedBy: options.approvedBy ?? "manager",
        pin: "",
        resolve,
        reject,
      });
    });

  return { state, setState, request };
}

export function ManagerApprovalModal({
  state,
  setState,
}: {
  state: ManagerApprovalState;
  setState: (updater: ManagerApprovalState | ((state: ManagerApprovalState) => ManagerApprovalState)) => void;
}) {
  if (!state.open) return null;
  const close = () => {
    state.reject?.();
    setState({ ...state, open: false, pin: "", resolve: undefined, reject: undefined });
  };
  const canSubmit = state.pin.length >= 4 && (!state.requireReason || state.reason.trim().length >= 3);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }} title={state.title} danger={state.danger}>
      {state.message ? <p className="text-sm text-muted">{state.message}</p> : null}
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          state.resolve?.({ pin: state.pin, reason: state.reason.trim(), approvedBy: state.approvedBy });
          setState({ ...state, open: false, pin: "", resolve: undefined, reject: undefined });
        }}
      >
        <input className="sr-only" name="username" tabIndex={-1} autoComplete="username" value="manager" readOnly aria-hidden="true" />
        <Input
          label={state.reasonLabel}
          value={state.reason}
          onChange={(event) => setState((current) => ({ ...current, reason: event.target.value }))}
          placeholder={state.requireReason ? "Required" : "Optional"}
          autoComplete="off"
        />
        <Input
          label={state.pinLabel}
          value={state.pin}
          onChange={(event) => setState((current) => ({ ...current, pin: event.target.value }))}
          type="password"
          autoComplete="current-password"
          autoFocus
        />
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" variant={state.danger ? "danger" : "accent"} disabled={!canSubmit}>{state.confirmLabel}</Button>
        </div>
      </form>
    </Dialog>
  );
}
