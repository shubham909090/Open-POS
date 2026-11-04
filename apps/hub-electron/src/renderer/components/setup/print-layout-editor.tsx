import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { billPrinterLineWidthChars, type PaymentQr } from "@gaurav-pos/shared";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import {
  hubApi,
  type BillPrinterSlot,
  type BillPrinters,
  type PrintLayoutSettings,
  type PrintLayouts,
  type ProductionUnit,
} from "../../hub-api.js";
import { PrintLayoutPreview } from "./print-layout-preview.js";
import { defaultSectionStyle, PrintLayoutStyleControls } from "./print-layout-style-controls.js";

type Scope = "receipt" | "unit";
type ToggleKey = "showTable" | "showDateTime" | "showBillId" | "showTaxBreakup" | "showDiscountTip" | "showPaymentSplit" | "showCaptain" | "showNcReprintRevision";

// Only flags the renderer actually reads for each ticket type (see domain/tickets.ts).
const TOGGLES: Record<Scope, Array<[ToggleKey, string]>> = {
  receipt: [
    ["showTable", "Table"],
    ["showDateTime", "Date and time"],
    ["showBillId", "Bill number"],
    ["showTaxBreakup", "Tax breakup"],
    ["showDiscountTip", "Discount and tip"],
    ["showPaymentSplit", "Payment split"],
    ["showNcReprintRevision", "NC / reprint labels"],
  ],
  unit: [
    ["showTable", "Table"],
    ["showCaptain", "Captain"],
    ["showDateTime", "Time"],
  ],
};

const PAPER_OPTIONS: Array<[number, string]> = [
  [42, "80 mm"],
  [48, "80 mm, wide text"],
  [32, "58 mm"],
  [28, "50 mm"],
  [25, "45 mm"],
];

export function PrintLayoutEditor({
  layouts,
  paymentQr,
  billPrinters,
  units,
  setNotice,
  requestManagerApproval,
  onSaved,
}: {
  layouts?: PrintLayouts;
  paymentQr?: PaymentQr | null;
  billPrinters?: BillPrinters;
  units: ProductionUnit[];
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onSaved: () => Promise<void>;
}) {
  const [target, setTarget] = useState("receipt");
  const [previewSlot, setPreviewSlot] = useState<BillPrinterSlot>("default");
  const scope: Scope = target === "receipt" ? "receipt" : "unit";
  const selectedUnitId = scope === "unit" ? target : "";
  const selectedLayout = scope === "receipt" ? layouts?.receipt : layouts?.units.find((entry) => entry.productionUnitId === selectedUnitId)?.layout;
  const [draft, setDraft] = useState<PrintLayoutSettings | null>(selectedLayout ?? null);
  const draftByLayout = useRef(new Map<string, PrintLayoutSettings>());
  const layoutKey = scope === "receipt" ? "receipt" : `unit:${selectedUnitId}`;
  const branding = useQuery({ queryKey: ["restaurant-branding"], queryFn: hubApi.restaurantBranding }).data?.branding;

  useEffect(() => {
    if (selectedLayout) setDraft(draftByLayout.current.get(layoutKey) ?? selectedLayout);
  }, [selectedLayout, layoutKey]);

  const save = useMutation({
    mutationFn: ({ pin, layout }: { pin: string; layout: PrintLayoutSettings }) => hubApi.updatePrintLayout(layout.scope, layout, pin),
    onSuccess: async (saved) => {
      const savedKey = saved.scope === "receipt" ? "receipt" : `unit:${saved.productionUnitId}`;
      draftByLayout.current.delete(savedKey);
      if (savedKey === layoutKey) setDraft(saved);
      await onSaved();
      setNotice({ tone: "good", text: "Print layout saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  if (!draft) return <p className="soft-note" role="status">Loading print layout…</p>;

  const remember = (next: PrintLayoutSettings) => {
    draftByLayout.current.set(layoutKey, next);
    setDraft(next);
  };
  const update = <K extends keyof PrintLayoutSettings>(key: K, value: PrintLayoutSettings[K]) => remember({ ...draft, [key]: value });
  const updateSectionStyle = (key: keyof PrintLayoutSettings["sectionStyles"], patch: Partial<PrintLayoutSettings["sectionStyles"][string]>) =>
    remember({ ...draft, sectionStyles: { ...draft.sectionStyles, [key]: { ...(draft.sectionStyles[key] ?? defaultSectionStyle), ...patch } } });

  const dirty = draftByLayout.current.has(layoutKey);
  const previewPrinter = scope === "receipt" ? billPrinters?.[previewSlot] : undefined;
  const effectiveWidth = previewPrinter ? billPrinterLineWidthChars(previewPrinter.paperWidthMm, draft.lineWidthChars) : draft.lineWidthChars;
  const effectivePaper = PAPER_OPTIONS.find(([chars]) => chars === effectiveWidth)?.[1] ?? `${effectiveWidth} characters`;
  const brandName = branding?.restaurantName?.trim();
  const unitName = units.find((unit) => unit.id === selectedUnitId)?.name ?? "Kitchen";

  const saveLayout = async () => {
    const approval = await requestManagerApproval({
      title: "Save print layout",
      defaultReason: "Print layout changed",
      confirmLabel: "Save layout",
    }).catch(() => null);
    if (approval)
      save.mutate({
        pin: approval.pin,
        layout: { ...draft, scope, productionUnitId: scope === "unit" ? selectedUnitId : undefined },
      });
  };

  return (
    <section className="layout-studio" aria-labelledby="layout-studio-title">
      <header className="layout-studio-head">
        <div>
          <h3 id="layout-studio-title">Ticket layout</h3>
          <p>What prints on customer bills and on each station's kitchen tickets.</p>
        </div>
        <label className="layout-target">
          Layout for
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="receipt">Customer bill</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                Kitchen ticket · {unit.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="layout-studio-body">
        <form className="layout-controls" onSubmit={(event) => event.preventDefault()} aria-label={scope === "receipt" ? "Customer bill layout" : `${unitName} kitchen ticket layout`}>
          <fieldset disabled={save.isPending}>
            <div className="layout-group">
              <h4>Paper and spacing</h4>
              <div className="layout-fields three">
                <label>
                  Paper width
                  <select value={draft.lineWidthChars} onChange={(event) => update("lineWidthChars", Number(event.target.value))}>
                    {PAPER_OPTIONS.map(([chars, label]) => (
                      <option key={chars} value={chars}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Blank lines before
                  <input type="number" min={0} max={6} value={draft.topPaddingLines} onChange={(event) => update("topPaddingLines", Number(event.target.value))} />
                </label>
                <label>
                  Blank lines after
                  <input type="number" min={1} max={8} value={draft.feedLines} onChange={(event) => update("feedLines", Number(event.target.value))} />
                </label>
              </div>
              {scope === "receipt" ? <p className="layout-hint">A bill printer with its own roll setting uses that width instead.</p> : null}
            </div>

            <div className="layout-group">
              <h4>Header and footer</h4>
              {scope === "receipt" ? (
                <p className="layout-identity">
                  <span>Restaurant name and logo</span>
                  <strong>{brandName || draft.restaurantName || "Not set"}</strong>
                  <small>Change them in General › Restaurant identity.</small>
                </p>
              ) : null}
              <div className="layout-fields two">
                {scope === "receipt" ? (
                  <>
                    <label className="span-2">
                      Address on bill
                      <textarea value={draft.restaurantAddress} onChange={(event) => update("restaurantAddress", event.target.value)} rows={2} placeholder="Shop address, phone" />
                    </label>
                    <label className="span-2">
                      GST registration line
                      <input value={draft.taxRegistrationText} onChange={(event) => update("taxRegistrationText", event.target.value)} placeholder="GSTIN 27ABCDE1234F1Z5" />
                    </label>
                  </>
                ) : null}
                <label>
                  Header text
                  <input
                    value={scope === "receipt" ? draft.billHeader : draft.kotHeader}
                    onChange={(event) => update(scope === "receipt" ? "billHeader" : "kotHeader", event.target.value)}
                  />
                </label>
                <label>
                  Header alignment
                  <select value={draft.headerAlign} onChange={(event) => update("headerAlign", event.target.value as "left" | "center")}>
                    <option value="center">Center</option>
                    <option value="left">Left</option>
                  </select>
                </label>
                <label>
                  Footer text
                  <input
                    value={scope === "receipt" ? draft.billFooter : draft.kotFooter}
                    onChange={(event) => update(scope === "receipt" ? "billFooter" : "kotFooter", event.target.value)}
                  />
                </label>
                <label>
                  Footer alignment
                  <select value={draft.footerAlign} onChange={(event) => update("footerAlign", event.target.value as "left" | "center")}>
                    <option value="center">Center</option>
                    <option value="left">Left</option>
                  </select>
                </label>
              </div>
            </div>

            <fieldset className="layout-group layout-checks">
              <legend>Print on {scope === "receipt" ? "bill" : "kitchen ticket"}</legend>
              <div className="layout-check-grid">
                {TOGGLES[scope].map(([key, label]) => (
                  <label key={key}>
                    <input type="checkbox" checked={draft[key]} onChange={(event) => update(key, event.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <PrintLayoutStyleControls draft={draft} scope={scope} updateSectionStyle={updateSectionStyle} />

            <div className="layout-actions">
              <button type="button" disabled={save.isPending || !dirty} onClick={() => void saveLayout()}>
                {save.isPending ? "Saving layout…" : "Save layout"}
              </button>
              <small role="status">{dirty ? "Unsaved changes. Switching layouts keeps this draft." : "No unsaved changes."}</small>
            </div>
          </fieldset>
        </form>

        <aside className="layout-preview-pane" aria-label="Print preview">
          <div className="layout-preview-head">
            <strong>Preview</strong>
            {scope === "receipt" && billPrinters ? (
              <label>
                <span className="sr-only">Preview printer</span>
                <select value={previewSlot} onChange={(event) => setPreviewSlot(event.target.value as BillPrinterSlot)}>
                  <option value="default">{billPrinters.default.label}</option>
                  <option value="alternate" disabled={!billPrinters.alternate.configured}>
                    {billPrinters.alternate.label}
                    {billPrinters.alternate.configured ? "" : " (not set)"}
                  </option>
                </select>
              </label>
            ) : (
              <span>{unitName}</span>
            )}
          </div>
          <p className="layout-preview-meta">
            {effectivePaper}
            {previewPrinter?.paperWidthMm ? " · printer setting" : ""}
            {scope === "receipt" && paymentQr ? ` · QR ${previewPrinter?.paymentQrSizeMm ?? paymentQr.sizeMm} mm` : ""}
          </p>
          <PrintLayoutPreview
            draft={{ ...draft, lineWidthChars: effectiveWidth }}
            paymentQr={paymentQr && previewPrinter ? { ...paymentQr, sizeMm: previewPrinter.paymentQrSizeMm } : paymentQr}
            restaurantName={brandName || draft.restaurantName}
            restaurantLogo={branding?.logoImageDataUrl ?? null}
            scope={scope}
            unitName={unitName}
          />
        </aside>
      </div>
    </section>
  );
}
