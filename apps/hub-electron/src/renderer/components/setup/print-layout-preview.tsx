import type { CSSProperties } from "react";

import {
  parsePrintStyleLine,
  renderBillTicketForPrint,
  renderKotTicketForPrint
} from "../../../domain/tickets.js";
import type { PrintLayoutSettings, ProductionUnit } from "../../hub-api.js";

export function PrintLayoutPreview({
  draft,
  scope,
  selectedUnitId,
  units,
}: {
  draft: PrintLayoutSettings;
  scope: "receipt" | "unit";
  selectedUnitId: string;
  units: ProductionUnit[];
}) {
  const preview = scope === "receipt"
    ? renderReceiptPreview(draft)
    : renderKotPreview(draft, selectedUnitId, units);
  const previewLines = preview.split(/\r?\n/).map((line) =>
    parsePrintStyleLine(line) ?? {
      text: line,
      size: "normal" as const,
      bold: false,
      align: "left" as const,
      graphicLine: false
    }
  );

  return (
    <div className="print-preview print-preview-styled">
      {previewLines.map((line, index) => (
        <div key={`${index}-${line.text}`} style={previewLineStyle(line)}>
          {line.graphicLine ? "\u00a0" : line.text || "\u00a0"}
        </div>
      ))}
    </div>
  );
}

function renderReceiptPreview(draft: PrintLayoutSettings): string {
  return renderBillTicketForPrint({
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
    taxBreakdown: draft.showTaxBreakup
      ? [
          { name: "CGST", rateBps: 250, amountPaise: 1100 },
          { name: "SGST", rateBps: 250, amountPaise: 1100 },
        ]
      : [],
    payments: draft.showPaymentSplit ? [{ method: "cash", amountPaise: 44000 }] : []
  });
}

function renderKotPreview(draft: PrintLayoutSettings, selectedUnitId: string, units: ProductionUnit[]): string {
  return renderKotTicketForPrint({
    sequence: 1,
    type: "new",
    tableName: "T1",
    productionUnitName: units.find((unit) => unit.id === selectedUnitId)?.name ?? "Kitchen",
    ticketLabel: "KOT",
    captainId: "Captain",
    createdAt: "2026-05-15T15:00:00.000Z",
    items: [{ name: "Paneer Tikka", quantityDelta: 2, note: "No onion" }],
    header: draft.kotHeader,
    footer: draft.kotFooter,
    ...draft
  });
}

function previewLineStyle(line: {
  size: "small" | "normal" | "large";
  bold: boolean;
  align: "left" | "center" | "right";
  graphicLine?: boolean;
}): CSSProperties {
  if (line.graphicLine) {
    return {
      borderTop: "1px solid currentColor",
      height: 10,
      margin: "4px 0",
      opacity: 0.9
    };
  }
  return {
    fontSize: line.size === "large" ? 16 : line.size === "small" ? 11 : 13,
    fontWeight: line.bold ? 800 : 500,
    lineHeight: line.size === "large" ? "22px" : line.size === "small" ? "15px" : "18px",
    textAlign: line.align,
    whiteSpace: "pre"
  };
}
