import type { LogoPrintSettings, PrintLayoutSettingsInput } from "@gaurav-pos/shared";
import { resolveReceiptRestaurantName } from "@gaurav-pos/shared";

import { renderBillTicketForPrint, renderKotTicketForPrint } from "../tickets.js";
import type { UnitRow } from "./types.js";

export function buildTestBillPrintPayload(template: PrintLayoutSettingsInput, paymentQr?: import("../tickets.js").BillTicket["paymentQr"], branding?: import("@gaurav-pos/shared").RestaurantBranding, paperWidthMm?: number | null, logoSettings?: LogoPrintSettings): string {
  return renderBillTicketForPrint({
    paymentQr,
    paperWidthMm: paperWidthMm ?? undefined,
    restaurantLogo: branding?.logoImageDataUrl ? {
      imageDataUrl: branding.logoImageDataUrl,
      widthMm: logoSettings?.logoWidthMm,
      threshold: logoSettings?.logoThreshold,
      printMode: logoSettings?.logoPrintMode
    } : null,
    tableName: "TEST",
    billId: "TEST-BILL",
    items: [{ name: "Test item", quantity: 1, unitPricePaise: 100, lineTotalPaise: 100 }],
    subtotalPaise: 100,
    taxPaise: 0,
    totalPaise: 100,
    finalTotalPaise: 100,
    createdAt: new Date().toISOString(),
    restaurantName: resolveReceiptRestaurantName(branding, template.restaurantName),
    restaurantAddress: template.restaurantAddress,
    taxRegistrationText: template.taxRegistrationText,
    lineWidthChars: template.lineWidthChars,
    headerAlign: template.headerAlign,
    footerAlign: template.footerAlign,
    sectionStyles: template.sectionStyles,
    topPaddingLines: template.topPaddingLines,
    feedLines: template.feedLines,
    showHeader: template.showHeader,
    showFooter: template.showFooter,
    showRestaurantName: template.showRestaurantName,
    showRestaurantLogo: template.showRestaurantLogo,
    showPaymentQr: template.showPaymentQr,
    showRestaurantAddress: template.showRestaurantAddress,
    showTaxRegistration: template.showTaxRegistration,
    showCustomerName: template.showCustomerName,
    showPaymentSplit: template.showPaymentSplit,
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
    showHeader: template.showHeader,
    showFooter: template.showFooter,
    showOrderNote: template.showOrderNote,
    showItemNotes: template.showItemNotes,
    showTable: template.showTable,
    showCaptain: template.showCaptain,
    showDateTime: template.showDateTime,
    header: template.kotHeader || "Printer test kitchen ticket",
    footer: template.kotFooter || "If you can read this, KOT printing is connected."
  });
}
