import type { PrintLayoutSettings } from "../../hub-api.js";
import { printSizeLevel } from "@gaurav-pos/shared";

const defaultSectionStyle: PrintLayoutSettings["sectionStyles"][keyof PrintLayoutSettings["sectionStyles"]] = { size: "normal", bold: false, align: "left" };
type SectionStyleKey = keyof PrintLayoutSettings["sectionStyles"];
type SectionStylePatch = Partial<PrintLayoutSettings["sectionStyles"][keyof PrintLayoutSettings["sectionStyles"]]>;

const sectionStyleKeys = [
  ["restaurantName", "Restaurant name"],
  ["address", "Address"],
  ["header", "Header"],
  ["title", "Title"],
  ["metadata", "Table / date"],
  ["items", "Item rows"],
  ["totals", "Totals"],
  ["notes", "Order note"],
  ["itemNotes", "Item notes"],
  ["footer", "Footer"],
] as const;

const kitchenOnly = new Set<string>(["notes", "itemNotes"]);
const billOnly = new Set<string>(["restaurantName", "address", "totals"]);

export function PrintLayoutStyleControls({
  draft,
  scope,
  updateSectionStyle,
}: {
  draft: PrintLayoutSettings;
  scope: "receipt" | "unit";
  updateSectionStyle: (key: SectionStyleKey, patch: SectionStylePatch) => void;
}) {
  return (
    <details className="setup-subdetails print-style-panel">
      <summary>
        <span>Text size and style</span>
        <small>Size, bold and alignment for each part of the {scope === "receipt" ? "bill" : "ticket"}</small>
      </summary>
      <div className="print-style-grid">
        {sectionStyleKeys.filter(([key]) => !(scope === "receipt" ? kitchenOnly : billOnly).has(key) && sectionIsVisible(key, draft, scope)).map(([key, label]) => {
          const style = draft.sectionStyles[key] ?? defaultSectionStyle;
          const shownLabel = key === "metadata" ? (scope === "receipt" ? "Bill details" : "Ticket details") : key === "footer" && draft.showFooter === false ? "QR caption" : label;
          return (
            <div key={key} className="print-style-row">
              <strong>{shownLabel}</strong>
              <div className="print-style-fields">
                <label className="print-size-control">
                  <span>Size <output>{printSizeLevel(style.size, style.sizeLevel)} / 10</output></span>
                  <input
                    aria-label={`${shownLabel} text size`}
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={printSizeLevel(style.size, style.sizeLevel)}
                    onChange={(event) => updateSectionStyle(key, { sizeLevel: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Align</span>
                  <select
                    value={style.align}
                    onChange={(event) => updateSectionStyle(key, { align: event.target.value as "left" | "center" | "right" })}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label className="inline-check print-bold-check">
                  <input
                    type="checkbox"
                    checked={style.bold}
                    onChange={(event) => updateSectionStyle(key, { bold: event.target.checked })}
                  />
                  Bold
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

export { defaultSectionStyle };

function sectionIsVisible(key: SectionStyleKey, draft: PrintLayoutSettings, scope: "receipt" | "unit"): boolean {
  switch (key) {
    case "restaurantName": return draft.showRestaurantName !== false;
    case "address": return draft.showRestaurantAddress !== false;
    case "header": return draft.showHeader !== false;
    case "footer": return draft.showFooter !== false || (scope === "receipt" && draft.showPaymentQr !== false);
    case "notes": return draft.showOrderNote !== false;
    case "itemNotes": return draft.showItemNotes !== false;
    case "metadata": return scope === "unit" || draft.showTable !== false || draft.showDateTime !== false || draft.showTaxRegistration !== false || draft.showCustomerName !== false || draft.showPaymentSplit !== false || draft.showNcReprintRevision !== false;
    case "title": return scope === "unit" || draft.showBillId !== false || draft.showNcReprintRevision !== false;
    default: return true;
  }
}
