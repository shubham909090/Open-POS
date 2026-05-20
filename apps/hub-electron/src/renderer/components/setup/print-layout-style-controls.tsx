import type { PrintLayoutSettings } from "../../hub-api.js";

const defaultSectionStyle = { size: "normal", bold: false, align: "left" } as const;
type SectionStyleKey = keyof PrintLayoutSettings["sectionStyles"];
type SectionStylePatch = Partial<PrintLayoutSettings["sectionStyles"][string]>;

const sectionStyleKeys = [
  ["restaurantName", "Restaurant name"],
  ["address", "Address"],
  ["header", "Header"],
  ["title", "Bill / KOT title"],
  ["metadata", "Table / date"],
  ["items", "Item rows"],
  ["totals", "Totals"],
  ["notes", "KOT general notes"],
  ["itemNotes", "Item notes"],
  ["footer", "Footer"],
] as const;

export function PrintLayoutStyleControls({
  draft,
  updateSectionStyle,
}: {
  draft: PrintLayoutSettings;
  updateSectionStyle: (key: SectionStyleKey, patch: SectionStylePatch) => void;
}) {
  return (
    <details className="setup-subdetails print-style-panel">
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
              <div className="print-style-fields">
                <label>
                  <span>Size</span>
                  <select
                    value={style.size}
                    onChange={(event) => updateSectionStyle(key, { size: event.target.value as "small" | "normal" | "large" })}
                  >
                    <option value="small">Small</option>
                    <option value="normal">Normal</option>
                    <option value="large">Large</option>
                  </select>
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
