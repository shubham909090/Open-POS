import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatInr } from "@gaurav-pos/shared";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import {
  hubApi,
  type PrintLayoutSettings,
  type ProductionUnit,
} from "../../hub-api.js";

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

  const preview = [
    draft.restaurantName,
    scope === "receipt" ? draft.restaurantAddress : "",
    draft.billHeader || draft.kotHeader,
    scope === "receipt" && draft.showBillId
      ? "BILL TEST-BILL"
      : "KOT #1 NEW",
    draft.showTable ? "Table: T1" : "",
    draft.showDateTime ? "Time: 15 May 2026, 8:30 PM" : "",
    "--------------------------------",
    scope === "receipt"
      ? "Paneer Tikka  2 x ₹220.00 = ₹440.00"
      : "+2 Paneer Tikka",
    scope === "receipt" ? `Subtotal: ${formatInr(44000)}` : "",
    scope === "receipt" && draft.showTaxBreakup
      ? `CGST: ${formatInr(1100)}\nSGST: ${formatInr(1100)}`
      : "",
    scope === "receipt" ? `Total: ${formatInr(46200)}` : "",
    scope === "receipt" && draft.showPaymentSplit
      ? `Payments\nCASH: ${formatInr(30000)}\nUPI: ${formatInr(16200)}`
      : "",
    draft.billFooter || draft.kotFooter,
  ]
    .filter(Boolean)
    .join("\n");

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
        <pre className="print-preview">{preview}</pre>
      </div>
    </section>
  );
}
