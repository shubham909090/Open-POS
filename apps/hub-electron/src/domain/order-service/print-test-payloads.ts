import type { PrintLayoutSettingsInput } from "@gaurav-pos/shared";

import { renderBillTicketForPrint, renderKotTicketForPrint } from "../tickets.js";
import type { UnitRow } from "./types.js";

export function buildTestBillPrintPayload(template: PrintLayoutSettingsInput): string {
  return renderBillTicketForPrint({
    tableName: "TEST",
    billId: "TEST-BILL",
    items: [{ name: "Test item", quantity: 1, unitPricePaise: 100, lineTotalPaise: 100 }],
    subtotalPaise: 100,
    taxPaise: 0,
    totalPaise: 100,
    finalTotalPaise: 100,
    createdAt: new Date().toISOString(),
    restaurantName: template.restaurantName,
    restaurantAddress: template.restaurantAddress,
    taxRegistrationText: template.taxRegistrationText,
    lineWidthChars: template.lineWidthChars,
    headerAlign: template.headerAlign,
    footerAlign: template.footerAlign,
    sectionStyles: template.sectionStyles,
    topPaddingLines: template.topPaddingLines,
    feedLines: template.feedLines,
    showTable: template.showTable,
    showDateTime: template.showDateTime,
    showBillId: template.showBillId,
    showTaxBreakup: template.showTaxBreakup,
    showDiscountTip: template.showDiscountTip,
    showNcReprintRevision: template.showNcReprintRevision,
    header: template.billHeader || "Printer test bill",
    footer: template.billFooter || "If you can read this, bill printing is connected."
  });
}

export function buildTestKotPrintPayload(input: {
  requestedBy: string;
  template: PrintLayoutSettingsInput;
  unit: UnitRow | undefined;
}): string {
  const { requestedBy, template, unit } = input;
  return renderKotTicketForPrint({
    sequence: 0,
    type: "test",
    tableName: "TEST",
    productionUnitName: unit?.name ?? "Kitchen / Counter",
    ticketLabel: "KOT",
    captainId: requestedBy,
    createdAt: new Date().toISOString(),
    items: [{ name: "Printer test item", quantityDelta: 1 }],
    lineWidthChars: template.lineWidthChars,
    headerAlign: template.headerAlign,
    footerAlign: template.footerAlign,
    sectionStyles: template.sectionStyles,
    topPaddingLines: template.topPaddingLines,
    feedLines: template.feedLines,
    showTable: template.showTable,
    showCaptain: template.showCaptain,
    showDateTime: template.showDateTime,
    header: template.kotHeader || "Printer test kitchen ticket",
    footer: template.kotFooter || "If you can read this, KOT printing is connected."
  });
}
