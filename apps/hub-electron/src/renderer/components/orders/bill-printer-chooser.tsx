import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { hubApi, type BillPrinterProfile, type BillPrinterSlot } from "../../hub-api.js";
import { Dialog } from "../ui/dialog.js";

function printerTarget(profile: BillPrinterProfile): string {
  if (profile.printerMode === "network") return profile.printerHost ? `${profile.printerHost}:${profile.printerPort ?? 9100}` : "Not configured";
  return profile.printerName || "Not configured";
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
  const options: Array<{ slot: BillPrinterSlot; profile: BillPrinterProfile }> = profiles
    ? [
        { slot: "default", profile: profiles.default },
        ...(profiles.alternate.configured ? [{ slot: "alternate" as const, profile: profiles.alternate }] : [])
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={title}>
      <div className="printer-choice-list">
        {billPrinters.isLoading ? <p className="plain-state">Loading bill printers...</p> : null}
        {options.map(({ slot, profile }) => (
          <button
            key={slot}
            type="button"
            className="printer-choice-button"
            disabled={busy || !profile.configured}
            onClick={() => onChoose(slot)}
          >
            <Printer size={18} />
            <span>
              <strong>{profile.label}</strong>
              <small>{profile.printerMode === "system" ? "PC printer" : "LAN printer"} · {printerTarget(profile)}</small>
            </span>
          </button>
        ))}
        {profiles && !profiles.alternate.configured ? (
          <p className="plain-state">Add second printer in Setup to show it here.</p>
        ) : null}
        {profiles && !profiles.default.configured ? (
          <p className="warning-text">Default bill printer is not configured.</p>
        ) : null}
      </div>
    </Dialog>
  );
}
