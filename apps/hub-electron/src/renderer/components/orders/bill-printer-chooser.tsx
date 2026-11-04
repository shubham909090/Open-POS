import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { hubApi, type BillPrinterProfile, type BillPrinterSlot } from "../../hub-api.js";
import { Dialog } from "../ui/dialog.js";

function printerTarget(profile: BillPrinterProfile): string {
  if (profile.printerMode === "network") return profile.printerHost ? `${profile.printerHost}:${profile.printerPort ?? 9100}` : "Not configured";
  return profile.printerName || "Not configured";
}

function slotLabel(slot: BillPrinterSlot): string {
  return slot === "default" ? "Default printer" : "Alternate printer";
}

function isDialogChromeKeyTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input,select,textarea,a,[aria-label='Close']"));
}

export function BillPrinterChooser({
  open,
  title,
  busy,
  onClose,
  onChoose,
  returnFocusRef
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  onClose: () => void;
  onChoose: (slot: BillPrinterSlot) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const billPrinters = useQuery({ queryKey: ["bill-printers"], queryFn: hubApi.billPrinters, enabled: open });
  const profiles = billPrinters.data;
  const [activeSlot, setActiveSlot] = useState<BillPrinterSlot>("default");
  const options: Array<{ slot: BillPrinterSlot; profile: BillPrinterProfile }> = useMemo(() => (
    profiles
      ? [
        { slot: "default", profile: profiles.default },
        ...(profiles.alternate.configured ? [{ slot: "alternate" as const, profile: profiles.alternate }] : [])
      ]
      : []
  ), [profiles]);
  const enabledOptions = useMemo(() => options.filter((option) => option.profile.configured), [options]);

  useEffect(() => {
    if (!open) return;
    setActiveSlot(enabledOptions[0]?.slot ?? "default");
  }, [enabledOptions, open]);

  // Start on the default printer so Enter prints there; printers may load after the dialog opens.
  const listRef = useRef<HTMLDivElement>(null);
  const hasFocusedChoice = useRef(false);
  useEffect(() => {
    if (!open) { hasFocusedChoice.current = false; return; }
    if (hasFocusedChoice.current || !enabledOptions.length) return;
    const frame = requestAnimationFrame(() => {
      if (hasFocusedChoice.current) return;
      const target = listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      if (!target) return;
      hasFocusedChoice.current = true;
      if (!listRef.current?.contains(document.activeElement)) target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [enabledOptions, open]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const fallback = enabledOptions[0];
    if (!fallback || busy) return;
    const currentIndex = Math.max(0, enabledOptions.findIndex((option) => option.slot === activeSlot));
    const activate = (slot: BillPrinterSlot) => {
      hasFocusedChoice.current = true;
      setActiveSlot(slot);
      listRef.current?.querySelector<HTMLButtonElement>(`[data-printer-slot="${slot}"]`)?.focus({ preventScroll: true });
    };
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activate(enabledOptions[Math.min(enabledOptions.length - 1, currentIndex + 1)]?.slot ?? fallback.slot);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      activate(enabledOptions[Math.max(0, currentIndex - 1)]?.slot ?? fallback.slot);
      return;
    }
    if ((event.key === "Enter" || event.key === " " || event.key === "Spacebar") && !isDialogChromeKeyTarget(event.target)) {
      event.preventDefault();
      const selected = enabledOptions.find((option) => option.slot === activeSlot) ?? fallback;
      if (selected) onChoose(selected.slot);
    }
  }, [activeSlot, busy, enabledOptions, onChoose]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={title} onKeyDown={handleKeyDown} returnFocusRef={returnFocusRef}>
      <div className="printer-choice-panel">
        {billPrinters.isLoading ? <p className="plain-state" role="status">Loading bill printers…</p> : null}
        {billPrinters.isError ? <div className="printer-choice-note" role="alert"><p>Bill printers could not load. Try again before printing.</p><button type="button" className="secondary-button compact" onClick={() => void billPrinters.refetch()} disabled={billPrinters.isFetching}>{billPrinters.isFetching ? "Retrying…" : "Retry"}</button></div> : null}
        <div className="printer-choice-list" ref={listRef}>
          {options.map(({ slot, profile }) => (
            <button
              key={slot}
              data-printer-slot={slot}
              type="button"
              className={`printer-choice-button ${slot}${activeSlot === slot && profile.configured ? " active" : ""}`}
              aria-pressed={activeSlot === slot && profile.configured}
              disabled={busy || !profile.configured}
              data-autofocus={slot === enabledOptions[0]?.slot ? true : undefined}
              onMouseEnter={() => {
                if (profile.configured) setActiveSlot(slot);
              }}
              onFocus={() => {
                if (profile.configured) { hasFocusedChoice.current = true; setActiveSlot(slot); }
              }}
              onClick={() => {
                if (!profile.configured) return;
                setActiveSlot(slot);
                onChoose(slot);
              }}
            >
              <span className="printer-choice-icon" aria-hidden="true">
                <Printer size={20} />
              </span>
              <span className="printer-choice-copy">
                <span>{slotLabel(slot)}</span>
                <strong>{profile.label}</strong>
                <small>{profile.printerMode === "system" ? "PC printer" : "LAN printer"} · {printerTarget(profile)}</small>
                <small>{profile.paperWidthMm ? `${profile.paperWidthMm} mm roll` : "Bill layout roll width"} · Payment QR {profile.paymentQrSizeMm} mm</small>
              </span>
              <b>{profile.configured ? "Select" : "Not set"}</b>
            </button>
          ))}
        </div>
        {profiles && !profiles.alternate.configured ? (
          <p className="printer-choice-note">Add a second bill printer in Setup to show an alternate option here.</p>
        ) : null}
        {profiles && !profiles.default.configured ? (
          <p className="warning-text">Default bill printer is not configured.</p>
        ) : null}
      </div>
    </Dialog>
  );
}
