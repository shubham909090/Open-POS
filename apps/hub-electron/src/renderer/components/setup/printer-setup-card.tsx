import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Pencil, Printer } from "lucide-react";
import { useContext, useState } from "react";

import { hubApi, type BillPrinterProfile, type BillPrinterSlot, type Bootstrap } from "../../hub-api.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { messageOf, type NoticeSetter } from "../../lib/format.js";
import {
  BillPrinterEditor,
  billPrinterConnectionPayload,
  billPrinterDraft,
  defaultBillPrinterLabel,
  type BillPrinterDraft,
} from "./bill-printer-editor.js";
import { PrintLayoutEditor } from "./print-layout-editor.js";
import { SettingsPageActiveContext, SetupCard } from "./setup-card.js";

const BILL_PRINTER_SLOTS: BillPrinterSlot[] = ["default", "alternate"];

export function PrinterSetupCard({
  bootstrap,
  setNotice,
  requestManagerApproval,
  onChanged,
}: {
  bootstrap: Bootstrap;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onChanged: () => Promise<unknown> | unknown;
}) {
  const queryClient = useQueryClient();
  const active = useContext(SettingsPageActiveContext);
  const [editingSlot, setEditingSlot] = useState<BillPrinterSlot | null>(null);
  const [systemPrintersLoading, setSystemPrintersLoading] = useState(false);
  const printerOutputMode = bootstrap.setup?.printerOutputMode ?? "test";
  const billPrinters = useQuery({ queryKey: ["bill-printers"], queryFn: hubApi.billPrinters, enabled: active });
  const systemPrinters = useQuery({ queryKey: ["system-printers"], queryFn: () => hubApi.systemPrinters(), enabled: false });
  const printLayouts = useQuery({ queryKey: ["print-layouts"], queryFn: hubApi.printLayouts, enabled: active });
  const paymentQr = useQuery({
    queryKey: ["payment-qr"],
    queryFn: hubApi.paymentQr,
    enabled: active,
    refetchInterval: active ? 30_000 : false,
  });
  const printers = billPrinters.data;
  const mainConfigured = Boolean(printers?.default.configured);
  const receiptLayoutWidth = printLayouts.data?.receipt.lineWidthChars;
  const systemPrinterLabel = (name: string) => systemPrinters.data?.find((printer) => printer.name === name)?.displayName ?? name;
  const cardSummary = `${printerOutputMode === "live" ? "Live" : "Test mode"} · ${
    printers ? (mainConfigured ? printers.default.label : "main bill printer not set") : "loading printers"
  }${printers?.alternate.configured ? ` + ${printers.alternate.label}` : ""}`;

  const invalidate = () => onChanged();
  const refreshSystemPrinters = async () => {
    if (systemPrintersLoading) return;
    setSystemPrintersLoading(true);
    try {
      const list = await hubApi.systemPrinters({ refresh: true });
      queryClient.setQueryData(["system-printers"], list);
      setNotice({ tone: "good", text: `${list.length} PC printers found.` });
    } catch (error) {
      setNotice({ tone: "bad", text: messageOf(error) });
    } finally {
      setSystemPrintersLoading(false);
    }
  };

  const updatePrinterMode = useMutation({
    mutationFn: (mode: "test" | "live") => hubApi.updatePrinterMode(mode),
    onSuccess: async (result) => {
      await invalidate();
      setNotice({
        tone: "good",
        text: result.mode === "live" ? "Printers are live. Real tickets will print." : "Printer test mode is on. Tickets are logged without printing.",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const requestPrinterMode = async (mode: "test" | "live") => {
    if (mode === printerOutputMode) return;
    if (mode === "live") {
      const approval = await requestManagerApproval({
        title: "Turn on live printing",
        message: "Live mode sends real bills and kitchen tickets to connected printers. Run test prints first.",
        defaultReason: "Enable live printer output",
        requireReason: false,
        confirmLabel: "Turn on live mode",
      }).catch(() => null);
      if (!approval) return;
    }
    updatePrinterMode.mutate(mode);
  };

  const savePrinter = useMutation({
    mutationFn: ({ slot, draft }: { slot: BillPrinterSlot; draft: BillPrinterDraft }) => {
      if (!printers) throw new Error("Printer settings are still loading.");
      // The PUT replaces both connections; the untouched printer is resent as saved,
      // and its roll/QR sizes are omitted so the hub keeps them.
      const payloadFor = (target: BillPrinterSlot) =>
        target === slot
          ? { ...billPrinterConnectionPayload(draft, slot), paperWidthMm: draft.paperWidthMm, paymentQrSizeMm: draft.paymentQrSizeMm }
          : billPrinterConnectionPayload(billPrinterDraft(printers[target], target), target);
      return hubApi.updateBillPrinters({ default: payloadFor("default"), alternate: payloadFor("alternate") });
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(["bill-printers"], saved);
      setEditingSlot(null);
      await invalidate();
      setNotice({ tone: "good", text: "Bill printer saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const testBillPrint = useMutation({
    mutationFn: hubApi.testBillPrint,
    onSuccess: async (result) => {
      await invalidate();
      setNotice({
        tone: result.processed.failed ? "bad" : "good",
        text: result.processed.failed
          ? `Test bill failed: ${result.processed.error ?? "check the print queue in Administration."}`
          : printerOutputMode === "live" ? "Test bill sent to the printer." : "Test bill logged (test mode, nothing printed).",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const testKotPrint = useMutation({
    mutationFn: hubApi.testKotPrint,
    onSuccess: async (result) => {
      await invalidate();
      setNotice({
        tone: result.processed.failed ? "bad" : "good",
        text: result.processed.failed
          ? "Test kitchen ticket failed. Check the print queue in Administration."
          : printerOutputMode === "live" ? "Test kitchen ticket sent." : "Test kitchen ticket logged (test mode, nothing printed).",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const targetText = (profile: BillPrinterProfile) =>
    profile.printerMode === "system"
      ? profile.printerName ? systemPrinterLabel(profile.printerName) : ""
      : profile.printerHost ? `${profile.printerHost}:${profile.printerPort ?? 9100}` : "";

  return (
    <SetupCard
      title="Printing"
      done={printerOutputMode === "test" || mainConfigured}
      icon={<Printer size={20} />}
      summary={cardSummary}
    >
      <section className="printer-overview" aria-labelledby="bill-printers-title">
        <header className="printer-overview-head">
          <div>
            <h3 id="bill-printers-title">Bill printers</h3>
            <p>Staff choose one of these when printing a bill. Roll width and QR size are set for each printer.</p>
          </div>
          <div className="printer-output" role="radiogroup" aria-label="Printer output">
            <span className={printerOutputMode === "live" ? "printer-output-state live" : "printer-output-state"}>
              {printerOutputMode === "live" ? "Live — real tickets print" : "Test mode — nothing prints"}
            </span>
            <div className="segmented-row">
              {(["test", "live"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={printerOutputMode === mode}
                  className={printerOutputMode === mode ? "active" : ""}
                  disabled={updatePrinterMode.isPending}
                  onClick={() => void requestPrinterMode(mode)}
                >
                  {mode === "test" ? "Test" : "Live"}
                </button>
              ))}
            </div>
          </div>
        </header>

        {printers ? (
          <div className="bill-printer-list">
            {BILL_PRINTER_SLOTS.map((slot) => {
              const profile = printers[slot];
              const target = targetText(profile);
              const editing = editingSlot === slot;
              return (
                <article key={slot} className={`bill-printer-row${editing ? " editing" : ""}`} aria-label={profile.label}>
                  <div className="bill-printer-summary">
                    <div className="bill-printer-name">
                      <strong>{profile.label || defaultBillPrinterLabel(slot)}</strong>
                      <span>{slot === "default" ? "Main" : "Second · optional"}</span>
                    </div>
                    <dl className="bill-printer-facts">
                      <div>
                        <dt>Connection</dt>
                        <dd className={profile.configured ? "" : "missing"}>
                          {profile.configured ? `${profile.printerMode === "system" ? "PC" : "LAN"} · ${target}` : slot === "default" ? "Not set" : "Not used"}
                        </dd>
                      </div>
                      <div>
                        <dt>Roll</dt>
                        <dd>{profile.paperWidthMm ? `${profile.paperWidthMm} mm` : `Layout${receiptLayoutWidth ? ` (${paperLabelForChars(receiptLayoutWidth)})` : ""}`}</dd>
                      </div>
                      <div>
                        <dt>Payment QR</dt>
                        <dd>{profile.paymentQrSizeMm} mm</dd>
                      </div>
                    </dl>
                    <div className="bill-printer-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => testBillPrint.mutate(slot)}
                        disabled={testBillPrint.isPending || !profile.configured}
                        aria-label={`Test print on ${profile.label}`}
                      >
                        <Printer size={15} /> Test
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setEditingSlot(editing ? null : slot)}
                        aria-expanded={editing}
                        aria-label={`Edit ${profile.label}`}
                        disabled={Boolean(editingSlot && !editing) || savePrinter.isPending}
                      >
                        <Pencil size={15} /> Edit
                      </button>
                    </div>
                  </div>
                  {editing ? (
                    <BillPrinterEditor
                      slot={slot}
                      initial={billPrinterDraft(profile, slot)}
                      systemPrinters={systemPrinters.data}
                      systemPrintersLoading={systemPrintersLoading}
                      onLoadSystemPrinters={() => void refreshSystemPrinters()}
                      saving={savePrinter.isPending}
                      onSave={(draft) => savePrinter.mutate({ slot, draft })}
                      onCancel={() => setEditingSlot(null)}
                    />
                  ) : null}
                </article>
              );
            })}
            <div className="bill-printer-row kitchen">
              <div className="bill-printer-summary">
                <div className="bill-printer-name">
                  <strong>Kitchen tickets</strong>
                  <span>Each station prints to its own printer</span>
                </div>
                <p className="bill-printer-note">Set station printers in Kitchen stations. Logos never print on kitchen tickets.</p>
                <div className="bill-printer-actions">
                  <button type="button" className="secondary-button" onClick={() => testKotPrint.mutate()} disabled={testKotPrint.isPending}>
                    <ChefHat size={15} /> Test
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="settings-info-row" role={billPrinters.isError ? "alert" : "status"}>
            <p className="soft-note">{billPrinters.isError ? messageOf(billPrinters.error) : "Loading bill printers…"}</p>
            {billPrinters.isError ? (
              <button type="button" className="secondary-button" onClick={() => void billPrinters.refetch()}>
                Retry printers
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section className="settings-print-layout-section">
        {printLayouts.isError ? (
          <div className="settings-info-row" role="alert">
            <p className="soft-note">{messageOf(printLayouts.error)}</p>
            <button type="button" className="secondary-button" onClick={() => void printLayouts.refetch()}>
              Retry layouts
            </button>
          </div>
        ) : null}
        {printLayouts.data || !printLayouts.isError ? (
          <PrintLayoutEditor
            layouts={printLayouts.data}
            paymentQr={paymentQr.isError ? null : paymentQr.data?.qr}
            billPrinters={printers}
            units={bootstrap.productionUnits}
            setNotice={setNotice}
            requestManagerApproval={requestManagerApproval}
            onSaved={async () => {
              await printLayouts.refetch();
              await invalidate();
            }}
          />
        ) : null}
      </section>
    </SetupCard>
  );
}

/** Layout widths are stored as characters per line; show the roll they correspond to. */
export function paperLabelForChars(lineWidthChars: number): string {
  if (lineWidthChars <= 25) return "45 mm";
  if (lineWidthChars <= 28) return "50 mm";
  if (lineWidthChars <= 32) return "58 mm";
  return lineWidthChars >= 48 ? "80 mm wide" : "80 mm";
}
