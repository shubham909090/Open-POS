import { printFontPoints, printPaperDotsForChars, type LogoPrintSettings } from "@gaurav-pos/shared";
import type { CSSProperties } from "react";

import { parsePrintStyleLine, renderBillTicketForPrint, renderKotTicketForPrint } from "../../../domain/tickets.js";
import type { PrintLayoutSettings } from "../../hub-api.js";

import { ThermalLogoPreview } from "./thermal-logo-preview.js";

type PreviewQr = { imageDataUrl: string; upiUri: string; sizeMm?: number } | null;

/** Printable width in mm for each characters-per-line preset, used to scale images like the printer does. */
function printableWidthMm(lineWidthChars: number) {
  if (lineWidthChars <= 25) return 40;
  if (lineWidthChars <= 28) return 45;
  if (lineWidthChars <= 32) return 48;
  return 72;
}

export function PrintLayoutPreview({
  draft,
  scope,
  unitName,
  paymentQr,
  restaurantName,
  restaurantLogo,
  logoSettings,
}: {
  draft: PrintLayoutSettings;
  scope: "receipt" | "unit";
  unitName: string;
  paymentQr?: PreviewQr;
  restaurantName: string;
  restaurantLogo: string | null;
  logoSettings?: LogoPrintSettings;
}) {
  const preview = scope === "receipt" ? renderReceiptPreview(draft, paymentQr ?? null, restaurantName, restaurantLogo, logoSettings) : renderKotPreview(draft, unitName);
  const lines = preview
    .split(/\r?\n/)
    .map((line) => parsePrintStyleLine(line) ?? { text: line, size: "normal" as const, bold: false, align: "left" as const, graphicLine: false })
    .filter((line) => !("paperWidthChars" in line && line.paperWidthChars));
  const printableMm = printableWidthMm(draft.lineWidthChars);
  const imageWidth = (mm: number) => `${Math.min(100, (mm / printableMm) * 100)}%`;

  return (
    <div className="print-paper" style={{ "--paper-chars": draft.lineWidthChars } as CSSProperties}>
      {lines.map((line, index) =>
        "logoImageDataUrl" in line && line.logoImageDataUrl ? (
          <div key={`logo-${index}`} className="print-paper-image">
            <ThermalLogoPreview imageDataUrl={line.logoImageDataUrl} paperDots={printPaperDotsForChars(draft.lineWidthChars)} settings={logoSettings} />
          </div>
        ) : "qrImageDataUrl" in line && line.qrImageDataUrl ? (
          <div key={`qr-${index}`} className="print-paper-image">
            <img src={line.qrImageDataUrl} alt={`Payment QR, ${line.qrSizeMm ?? 32} mm`} className="qr" style={{ width: imageWidth(line.qrSizeMm ?? 32) }} />
          </div>
        ) : (
          <div key={`${index}-${line.text}`} style={previewLineStyle(line)}>
            {line.graphicLine ? " " : line.text || " "}
          </div>
        ),
      )}
    </div>
  );
}

function renderReceiptPreview(draft: PrintLayoutSettings, paymentQr: PreviewQr, restaurantName: string, restaurantLogo: string | null, logoSettings?: LogoPrintSettings): string {
  return renderBillTicketForPrint({
    ...draft,
    paymentQr,
    restaurantLogo: restaurantLogo ? { imageDataUrl: restaurantLogo, widthMm: logoSettings?.logoWidthMm, printMode: logoSettings?.logoPrintMode, threshold: logoSettings?.logoThreshold } : null,
    tableName: "T1",
    billId: "TEST-BILL",
    createdAt: "2026-05-15T15:00:00.000Z",
    restaurantName,
    customerName: "Sample guest",
    restaurantAddress: draft.restaurantAddress,
    taxRegistrationText: draft.taxRegistrationText,
    header: draft.billHeader,
    footer: draft.billFooter,
    items: [
      { name: "Paneer Tikka", quantity: 2, unitPricePaise: 22000, lineTotalPaise: 44000 },
      { name: "Butter Naan", quantity: 3, unitPricePaise: 5500, lineTotalPaise: 16500 },
    ],
    subtotalPaise: 60500,
    taxPaise: 3025,
    totalPaise: 63525,
    taxBreakdown: [
      { name: "CGST", rateBps: 250, amountPaise: 1513 },
      { name: "SGST", rateBps: 250, amountPaise: 1512 },
    ],
    payments: [{ method: "cash", amountPaise: 63525 }],
  });
}

function renderKotPreview(draft: PrintLayoutSettings, unitName: string): string {
  return renderKotTicketForPrint({
    sequence: 1,
    type: "new",
    tableName: "T1",
    productionUnitName: unitName,
    ticketLabel: "KOT",
    captainId: "Captain",
    createdAt: "2026-05-15T15:00:00.000Z",
    items: [{ name: "Paneer Tikka", quantityDelta: 2, note: "No onion" }],
    note: "Less spicy",
    header: draft.kotHeader,
    footer: draft.kotFooter,
    ...draft,
  });
}

function previewLineStyle(line: { size: "small" | "normal" | "large"; sizeLevel?: number; bold: boolean; align: "left" | "center" | "right"; graphicLine?: boolean }): CSSProperties {
  if (line.graphicLine) return { borderTop: "1px solid currentColor", height: 10, margin: "4px 0", opacity: 0.9 };
  const points = line.sizeLevel === undefined ? (line.size === "large" ? 14 : line.size === "small" ? 9 : 11) : printFontPoints(line.size, line.sizeLevel);
  // 11pt is the printer's normal size; scale relative to the paper's 1ch so wide text still fits the roll.
  return {
    fontSize: `${points / 11}em`,
    fontWeight: line.bold ? 700 : 400,
    lineHeight: 1.35,
    textAlign: line.align,
    whiteSpace: "pre",
  };
}
