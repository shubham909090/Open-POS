import { type CSSProperties, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { parsePrintStyleLine, renderBillTicketForPrint, renderKotTicketForPrint } from "../../../domain/tickets.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import {
  hubApi,
  type PrintLayoutSettings,
  type ProductionUnit,
} from "../../hub-api.js";

const defaultSectionStyle = { size: "normal", bold: false, align: "left" } as const;

export function PrintLayoutEditor({
  layouts,
  units,
  setNotice,
  requestManagerApproval,
  onSaved,
}: {
  layouts?: {
    default: PrintLayoutSettings;
    receipt: PrintLayoutSettings;
    units: Array<{
      productionUnitId: string;
      name: string;
      layout: PrintLayoutSettings;
    }>;
  };
  units: ProductionUnit[];
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onSaved: () => Promise<void>;
}) {
  const [scope, setScope] = useState<"receipt" | "unit">("receipt");
  const [unitId, setUnitId] = useState("");
  const selectedUnitId = unitId || units[0]?.id || "";
  const selectedLayout =
    scope === "receipt"
      ? layouts?.receipt
      : layouts?.units.find(
          (entry) => entry.productionUnitId === selectedUnitId,
        )?.layout;
  const [draft, setDraft] = useState<PrintLayoutSettings | null>(
    selectedLayout ?? null,
  );

  useEffect(() => {
    if (scope === "unit" && !unitId && units[0]?.id) setUnitId(units[0].id);
  }, [scope, unitId, units]);

  useEffect(() => {
    if (selectedLayout) setDraft(selectedLayout);
  }, [selectedLayout]);

  const save = useMutation({
    mutationFn: (pin: string) => {
      if (!draft) throw new Error("Print layout is still loading");
      return hubApi.updatePrintLayout(scope, {
        ...draft,
        scope,
        productionUnitId: scope === "unit" ? selectedUnitId : undefined,
      }, pin);
    },
    onSuccess: async () => {
      await onSaved();
      setNotice({ tone: "good", text: "Print layout saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  if (!draft)
    return (
      <p className="text-sm text-muted">Loading print layout controls...</p>
    );

  const update = <K extends keyof PrintLayoutSettings>(
    key: K,
    value: PrintLayoutSettings[K],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const preview = scope === "receipt"
    ? renderBillTicketForPrint({
        ...draft,
        tableName: "T1",
        billId: "TEST-BILL",
        createdAt: "2026-05-15T15:00:00.000Z",
        restaurantName: draft.restaurantName,
        restaurantAddress: draft.restaurantAddress,
        taxRegistrationText: draft.taxRegistrationText,
        header: draft.billHeader,
        footer: draft.billFooter,
        items: [{ name: "Paneer Tikka", quantity: 2, unitPricePaise: 22000, lineTotalPaise: 44000 }],
        subtotalPaise: 44000,
        taxPaise: draft.showTaxBreakup ? 2200 : 0,
        totalPaise: 44000,
        taxBreakdown: draft.showTaxBreakup ? [{ name: "Food CGST", rateBps: 250, amountPaise: 1100 }, { name: "Food SGST", rateBps: 250, amountPaise: 1100 }] : [],
        payments: draft.showPaymentSplit ? [{ method: "cash", amountPaise: 44000 }] : []
      })
    : renderKotTicketForPrint({
        sequence: 1,
        type: "new",
        tableName: "T1",
        productionUnitName: units.find((unit) => unit.id === selectedUnitId)?.name ?? "Kitchen",
        ticketLabel: "KOT",
        captainId: "Captain",
        createdAt: "2026-05-15T15:00:00.000Z",
        note: "No onion",
        items: [{ name: "Paneer Tikka", quantityDelta: 2 }],
        header: draft.kotHeader,
        footer: draft.kotFooter,
        ...draft
      });
  const previewLines = preview.split(/\r?\n/).map((line) => parsePrintStyleLine(line) ?? { text: line, size: "normal" as const, bold: false, align: "left" as const });

  const sectionStyleKeys = [
    ["restaurantName", "Restaurant name"],
    ["address", "Address"],
    ["header", "Header"],
    ["title", "Bill / KOT title"],
    ["metadata", "Table / date"],
    ["items", "Item rows"],
    ["totals", "Totals"],
    ["notes", "KOT notes"],
    ["footer", "Footer"],
  ] as const;

  const updateSectionStyle = (
    key: keyof PrintLayoutSettings["sectionStyles"],
    patch: Partial<PrintLayoutSettings["sectionStyles"][string]>,
  ) => {
    setDraft((current) => current ? {
      ...current,
      sectionStyles: {
        ...current.sectionStyles,
        [key]: { ...(current.sectionStyles[key] ?? defaultSectionStyle), ...patch }
      }
    } : current);
  };

  return (
    <section className="sub-panel">
      <div className="panel-title">
        <div>
          <h3>Customize print layout</h3>
          <span>
            Cash counter and each kitchen/counter can have its own text layout.
          </span>
        </div>
      </div>
      <div className="layout-editor">
        <form
          className="template-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <label>
            Layout for
            <select
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as "receipt" | "unit")
              }
            >
              <option value="receipt">Cash counter bill</option>
              <option value="unit">Kitchen / counter ticket</option>
            </select>
          </label>
          {scope === "unit" ? (
            <label>
              Kitchen / counter
              <select
                value={selectedUnitId}
                onChange={(event) => setUnitId(event.target.value)}
              >
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Paper width
            <select
              value={draft.lineWidthChars}
              onChange={(event) =>
                update("lineWidthChars", Number(event.target.value))
              }
            >
              <option value={25}>45mm / extra narrow</option>
              <option value={28}>50mm / receipt default</option>
              <option value={32}>58mm / narrow</option>
              <option value={42}>80mm standard</option>
              <option value={48}>80mm wide</option>
            </select>
          </label>
          <label>
            Header alignment
            <select
              value={draft.headerAlign}
              onChange={(event) =>
                update(
                  "headerAlign",
                  event.target.value as "left" | "center",
                )
              }
            >
              <option value="center">Center</option>
              <option value="left">Left</option>
            </select>
          </label>
          <label>
            Footer alignment
            <select
              value={draft.footerAlign}
              onChange={(event) =>
                update(
                  "footerAlign",
                  event.target.value as "left" | "center",
                )
              }
            >
              <option value="center">Center</option>
              <option value="left">Left</option>
            </select>
          </label>
          <label>
            Top blank lines
            <input
              type="number"
              min={0}
              max={6}
              value={draft.topPaddingLines}
              onChange={(event) =>
                update("topPaddingLines", Number(event.target.value))
              }
            />
          </label>
          <label>
            Blank lines after print
            <input
              type="number"
              min={1}
              max={8}
              value={draft.feedLines}
              onChange={(event) =>
                update("feedLines", Number(event.target.value))
              }
            />
          </label>
          <label>
            Restaurant name
            <input
              value={draft.restaurantName}
              onChange={(event) =>
                update("restaurantName", event.target.value)
              }
            />
          </label>
          {scope === "receipt" ? (
            <label>
              Address on bill
              <textarea
                value={draft.restaurantAddress}
                onChange={(event) =>
                  update("restaurantAddress", event.target.value)
                }
                rows={3}
                placeholder="Shop address / phone line"
              />
            </label>
          ) : null}
          <label>
            GST registration line
            <input
              value={draft.taxRegistrationText}
              onChange={(event) =>
                update("taxRegistrationText", event.target.value)
              }
            />
          </label>
          <label>
            Header text
            <input
              value={
                scope === "receipt" ? draft.billHeader : draft.kotHeader
              }
              onChange={(event) =>
                update(
                  scope === "receipt" ? "billHeader" : "kotHeader",
                  event.target.value,
                )
              }
            />
          </label>
          <label>
            Footer text
            <input
              value={
                scope === "receipt" ? draft.billFooter : draft.kotFooter
              }
              onChange={(event) =>
                update(
                  scope === "receipt" ? "billFooter" : "kotFooter",
                  event.target.value,
                )
              }
            />
          </label>
          <div className="checkbox-grid">
            <label>
              <input
                type="checkbox"
                checked={draft.showTable}
                onChange={(event) =>
                  update("showTable", event.target.checked)
                }
              />{" "}
              Table
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.showDateTime}
                onChange={(event) =>
                  update("showDateTime", event.target.checked)
                }
              />{" "}
              Date/time
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.showTaxBreakup}
                onChange={(event) =>
                  update("showTaxBreakup", event.target.checked)
                }
              />{" "}
              Tax breakup
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.showDiscountTip}
                onChange={(event) =>
                  update("showDiscountTip", event.target.checked)
                }
              />{" "}
              Discount/tip
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.showPaymentSplit}
                onChange={(event) =>
                  update("showPaymentSplit", event.target.checked)
                }
              />{" "}
              Payment split
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.showBillId}
                onChange={(event) =>
                  update("showBillId", event.target.checked)
                }
              />{" "}
              Bill/KOT number
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.showCaptain}
                onChange={(event) =>
                  update("showCaptain", event.target.checked)
                }
              />{" "}
              Captain on KOT
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.showNcReprintRevision}
                onChange={(event) =>
                  update("showNcReprintRevision", event.target.checked)
                }
              />{" "}
              NC/reprint labels
            </label>
          </div>
          <details className="setup-subdetails">
            <summary>
              <span>Section font controls</span>
              <small>Size, bold, and alignment</small>
            </summary>
            <div className="print-style-grid">
              {sectionStyleKeys.map(([key, label]) => {
                const style = draft.sectionStyles[key] ?? defaultSectionStyle;
                return (
                  <div key={key} className="print-style-row">
                    <strong>{label}</strong>
                    <select value={style.size} onChange={(event) => updateSectionStyle(key, { size: event.target.value as "small" | "normal" | "large" })}>
                      <option value="small">Small</option>
                      <option value="normal">Normal</option>
                      <option value="large">Large</option>
                    </select>
                    <select value={style.align} onChange={(event) => updateSectionStyle(key, { align: event.target.value as "left" | "center" | "right" })}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                    <label className="inline-check">
                      <input type="checkbox" checked={style.bold} onChange={(event) => updateSectionStyle(key, { bold: event.target.checked })} />
                      Bold
                    </label>
                  </div>
                );
              })}
            </div>
          </details>
          <button
            type="button"
            disabled={save.isPending}
            onClick={async () => {
              const approval = await requestManagerApproval({
                title: "Save print layout",
                defaultReason: "Print layout changed",
                confirmLabel: save.isPending ? "Saving..." : "Save layout",
              }).catch(() => null);
              if (approval) save.mutate(approval.pin);
            }}
          >
            Save layout
          </button>
        </form>
        <div className="print-preview print-preview-styled">
          {previewLines.map((line, index) => (
            <div key={`${index}-${line.text}`} style={previewLineStyle(line)}>
              {line.text || "\u00a0"}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function previewLineStyle(line: { size: "small" | "normal" | "large"; bold: boolean; align: "left" | "center" | "right" }): CSSProperties {
  return {
    fontSize: line.size === "large" ? 16 : line.size === "small" ? 11 : 13,
    fontWeight: line.bold ? 800 : 500,
    lineHeight: line.size === "large" ? "22px" : line.size === "small" ? "15px" : "18px",
    textAlign: line.align,
    whiteSpace: "pre"
  };
}
