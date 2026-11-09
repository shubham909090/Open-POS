import { useState } from "react";
import { LOGO_PRINT_DEFAULTS, billPrinterLineWidthChars, printPaperDotsForChars, logoPrintWidthMm, type LogoPrintSettings } from "@gaurav-pos/shared";
import { ThermalLogoPreview } from "./thermal-logo-preview.js";
import type { BillPrinterProfile, BillPrinterSlot, SystemPrinterInfo } from "../../hub-api.js";

export type PaperWidthMm = 45 | 50 | 58 | 80;
export const PAPER_WIDTH_OPTIONS: PaperWidthMm[] = [80, 58, 50, 45];

export type BillPrinterDraft = {
  label: string;
  printerMode: "system" | "network";
  printerName: string;
  printerHost: string;
  printerPort: string;
  paperWidthMm: PaperWidthMm | null;
  paymentQrSizeMm: number;
  logoWidthMm: number | null;
  logoPrintMode: NonNullable<LogoPrintSettings["logoPrintMode"]>;
  logoThreshold: number;
};

export function billPrinterDraft(profile: BillPrinterProfile, slot: BillPrinterSlot): BillPrinterDraft {
  return {
    label: profile.label || defaultBillPrinterLabel(slot),
    printerMode: profile.printerMode,
    printerName: profile.printerName ?? "",
    printerHost: profile.printerHost ?? "",
    printerPort: String(profile.printerPort ?? 9100),
    paperWidthMm: profile.paperWidthMm ?? null,
    paymentQrSizeMm: profile.paymentQrSizeMm ?? 32,
    logoWidthMm: profile.logoWidthMm ?? null,
    logoPrintMode: profile.logoPrintMode ?? LOGO_PRINT_DEFAULTS.printMode,
    logoThreshold: profile.logoThreshold ?? LOGO_PRINT_DEFAULTS.threshold,
  };
}

export function defaultBillPrinterLabel(slot: BillPrinterSlot) {
  return slot === "default" ? "Main bill printer" : "Second bill printer";
}

/** Connection fields only; omitting paper and QR sizes keeps the hub's saved values. */
export function billPrinterConnectionPayload(draft: BillPrinterDraft, slot: BillPrinterSlot) {
  return {
    label: draft.label.trim() || defaultBillPrinterLabel(slot),
    printerMode: draft.printerMode,
    printerName: draft.printerMode === "system" ? draft.printerName || undefined : undefined,
    printerHost: draft.printerMode === "network" ? draft.printerHost.trim() : "",
    printerPort: Number(draft.printerPort || 9100),
  };
}

export function BillPrinterEditor({
  slot,
  initial,
  systemPrinters,
  systemPrintersLoading,
  onLoadSystemPrinters,
  saving,
  onSave,
  onCancel,
  layoutWidthChars,
  logoImageDataUrl,
}: {
  slot: BillPrinterSlot;
  initial: BillPrinterDraft;
  systemPrinters: SystemPrinterInfo[] | undefined;
  systemPrintersLoading: boolean;
  onLoadSystemPrinters: () => void;
  saving: boolean;
  onSave: (draft: BillPrinterDraft) => void;
  onCancel: () => void;
  layoutWidthChars?: number;
  logoImageDataUrl?: string | null;
}) {
  const [draft, setDraft] = useState(initial);
  const set = <K extends keyof BillPrinterDraft>(key: K, value: BillPrinterDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const hasTarget = draft.printerMode === "system" ? Boolean(draft.printerName) : Boolean(draft.printerHost.trim());
  // The second printer may be left empty; the main printer must point somewhere.
  const canSave = slot === "alternate" || hasTarget;
  const idPrefix = `bill-printer-${slot}`;
  const paperDots = printPaperDotsForChars(billPrinterLineWidthChars(draft.paperWidthMm, layoutWidthChars ?? 28));
  const printableWidthMm = Math.floor(logoPrintWidthMm(paperDots, LOGO_PRINT_DEFAULTS.maxWidthMm));

  return (
    <form
      className="bill-printer-editor"
      aria-label={`Edit ${draft.label || defaultBillPrinterLabel(slot)}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSave(draft);
      }}
    >
      <fieldset disabled={saving}>
        <div className="bill-printer-editor-grid">
          <label>
            Printer label
            <input value={draft.label} onChange={(event) => set("label", event.target.value)} placeholder={defaultBillPrinterLabel(slot)} />
          </label>
          <div className="field-group" role="radiogroup" aria-labelledby={`${idPrefix}-connection`}>
            <span id={`${idPrefix}-connection`}>Connection</span>
            <div className="segmented-row">
              {(["system", "network"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={draft.printerMode === mode}
                  className={draft.printerMode === mode ? "active" : ""}
                  onClick={() => set("printerMode", mode)}
                >
                  {mode === "system" ? "PC printer" : "LAN printer"}
                </button>
              ))}
            </div>
          </div>
          {draft.printerMode === "system" ? (
            <label className="span-2">
              Installed printer
              <span className="field-with-action">
                <select value={draft.printerName} onChange={(event) => set("printerName", event.target.value)}>
                  <option value="">
                    {systemPrinters?.length ? (slot === "alternate" ? "Not used" : "Choose PC printer") : draft.printerName || "Load PC printers first"}
                  </option>
                  {draft.printerName && !systemPrinters?.some((printer) => printer.name === draft.printerName) ? (
                    <option value={draft.printerName}>{draft.printerName}</option>
                  ) : null}
                  {(systemPrinters ?? []).map((printer) => (
                    <option key={printer.name} value={printer.name}>
                      {printer.displayName}
                      {printer.isDefault ? " (Windows default)" : ""}
                    </option>
                  ))}
                </select>
                <button type="button" className="secondary-button" onClick={onLoadSystemPrinters} disabled={systemPrintersLoading} aria-busy={systemPrintersLoading}>
                  {systemPrintersLoading ? "Loading…" : systemPrinters ? "Refresh list" : "Load PC printers"}
                </button>
              </span>
            </label>
          ) : (
            <>
              <label>
                Printer IP
                <input value={draft.printerHost} onChange={(event) => set("printerHost", event.target.value)} placeholder="192.168.1.50" inputMode="decimal" />
              </label>
              <label>
                Port
                <input value={draft.printerPort} onChange={(event) => set("printerPort", event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="9100" />
              </label>
            </>
          )}
          <label>
            Paper roll
            <select
              value={draft.paperWidthMm ?? ""}
              onChange={(event) => set("paperWidthMm", event.target.value ? (Number(event.target.value) as PaperWidthMm) : null)}
              aria-describedby={`${idPrefix}-paper-hint`}
            >
              <option value="">Same as bill layout</option>
              {PAPER_WIDTH_OPTIONS.map((width) => (
                <option key={width} value={width}>
                  {width} mm roll
                </option>
              ))}
            </select>
            <small id={`${idPrefix}-paper-hint`}>Set this when this printer uses a different roll from the bill layout.</small>
          </label>
          <div className="bill-logo-controls span-2">
            <div className="print-size-control">
              <span>
                Logo width
                <output>
                  {draft.logoWidthMm === null ? `Auto · ${Math.round(logoPrintWidthMm(paperDots))} mm` : `${Math.min(draft.logoWidthMm, printableWidthMm)} mm`}
                </output>
              </span>
              <div className="segmented-row" role="radiogroup" aria-label="Logo width mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.logoWidthMm === null}
                  className={draft.logoWidthMm === null ? "active" : ""}
                  onClick={() => set("logoWidthMm", null)}
                >Auto</button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.logoWidthMm !== null}
                  className={draft.logoWidthMm !== null ? "active" : ""}
                  onClick={() => set("logoWidthMm", Math.min(printableWidthMm, LOGO_PRINT_DEFAULTS.widthMm))}
                >Custom</button>
              </div>
              {draft.logoWidthMm !== null ? (
                <input
                  id={`${idPrefix}-logo-width`}
                  type="range"
                  min={LOGO_PRINT_DEFAULTS.minWidthMm}
                  max={printableWidthMm}
                  step={1}
                  value={Math.min(draft.logoWidthMm, printableWidthMm)}
                  onChange={(event) => set("logoWidthMm", Number(event.target.value))}
                  aria-label="Logo printed width in millimetres"
                  aria-valuetext={`${Math.min(draft.logoWidthMm, printableWidthMm)} millimetres`}
                />
              ) : null}
            </div>
            <details className="logo-print-adjustments">
              <summary>Print quality</summary>
              <label>
                Style
                <select value={draft.logoPrintMode} onChange={(event) => set("logoPrintMode", event.target.value as BillPrinterDraft["logoPrintMode"])}>
                  <option value="threshold">Solid · text and line art</option>
                  <option value="dither">Detailed · shaded logos</option>
                </select>
              </label>
              <label className="print-size-control">
                <span>Ink density <output>{draft.logoThreshold}</output></span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  step={1}
                  value={draft.logoThreshold}
                  onChange={(event) => set("logoThreshold", Number(event.target.value))}
                  aria-label="Logo ink density"
                />
              </label>
            </details>
            {logoImageDataUrl ? (
              <div className="bill-logo-preview">
                <ThermalLogoPreview imageDataUrl={logoImageDataUrl} paperDots={paperDots} settings={draft} />
                <small>Printed logo</small>
              </div>
            ) : <small>Upload a logo in General.</small>}
          </div>
          <label className="print-size-control">
            <span>
              Payment QR size <output>{draft.paymentQrSizeMm} mm</output>
            </span>
            <input
              type="range"
              min={20}
              max={45}
              step={1}
              value={draft.paymentQrSizeMm}
              onChange={(event) => set("paymentQrSizeMm", Number(event.target.value))}
              aria-label="Payment QR printed size in millimetres"
              aria-valuetext={`${draft.paymentQrSizeMm} millimetres`}
            />
            <small>Fits within this printer’s printable width. 32 mm is a clear starting size.</small>
            <small>
              20 mm <span>45 mm</span>
            </small>
          </label>
        </div>
        <div className="form-actions start">
          <button type="submit" disabled={!canSave}>
            {saving ? "Saving…" : "Save printer"}
          </button>
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          {!canSave ? <small role="status">Choose a PC printer or enter the LAN printer IP.</small> : null}
        </div>
      </fieldset>
    </form>
  );
}
