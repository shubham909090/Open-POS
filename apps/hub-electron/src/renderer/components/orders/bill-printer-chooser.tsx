import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
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
  onChoose
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  onClose: () => void;
  onChoose: (slot: BillPrinterSlot) => void;
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

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const fallback = enabledOptions[0];
    if (!fallback || busy) return;
    const currentIndex = Math.max(0, enabledOptions.findIndex((option) => option.slot === activeSlot));
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSlot(enabledOptions[Math.min(enabledOptions.length - 1, currentIndex + 1)]?.slot ?? fallback.slot);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSlot(enabledOptions[Math.max(0, currentIndex - 1)]?.slot ?? fallback.slot);
      return;
    }
    if ((event.key === "Enter" || event.key === " " || event.key === "Spacebar") && !isDialogChromeKeyTarget(event.target)) {
      event.preventDefault();
      const selected = enabledOptions.find((option) => option.slot === activeSlot) ?? fallback;
      if (selected) onChoose(selected.slot);
    }
  }, [activeSlot, busy, enabledOptions, onChoose]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={title} onKeyDown={handleKeyDown}>
      <div className="printer-choice-panel">
        <div className="printer-choice-intro">
          <strong>Select bill printer</strong>
          <span>Choose where this bill print should go.</span>
        </div>
        {billPrinters.isLoading ? <p className="plain-state">Loading bill printers...</p> : null}
        <div className="printer-choice-list">
          {options.map(({ slot, profile }) => (
            <button
              key={slot}
              type="button"
              className={`printer-choice-button ${slot}${activeSlot === slot && profile.configured ? " active" : ""}`}
              aria-selected={activeSlot === slot && profile.configured}
              disabled={busy || !profile.configured}
              onMouseEnter={() => {
                if (profile.configured) setActiveSlot(slot);
              }}
              onFocus={() => {
                if (profile.configured) setActiveSlot(slot);
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
