import type { BillPrinterSlot, PrintLayoutSettingsInput, PrinterOutputMode } from "@gaurav-pos/shared";
import type { BillPrinterProfile } from "./types.js";

export type SettingReader = (key: string) => string | undefined;

export function billPrinterSettingPrefix(slot: BillPrinterSlot): string {
  return slot === "default" ? "receipt_printer" : "receipt_printer_alternate";
}

export function billPrinterDefaultLabel(slot: BillPrinterSlot): string {
  return slot === "default" ? "Main bill printer" : "Second bill printer";
}

export function readBillPrinterProfile(readSetting: SettingReader, slot: BillPrinterSlot): BillPrinterProfile {
  const prefix = billPrinterSettingPrefix(slot);
  const mode = readSetting(`${prefix}_mode`);
  const host = readSetting(`${prefix}_host`);
  const port = readSetting(`${prefix}_port`);
  const name = readSetting(`${prefix}_name`);
  const label = readSetting(`${prefix}_label`) || billPrinterDefaultLabel(slot);
  const printerMode = mode === "network" ? "network" : "system";
  const printerHost = host || null;
  const printerName = name || null;
  const printerPort = port ? Number(port) : null;
  return {
    label,
    printerMode,
    printerHost,
    printerPort,
    printerName,
    configured: printerMode === "network" ? Boolean(printerHost) : Boolean(printerName)
  };
}

export function billPrinterSettingValues(
  slot: BillPrinterSlot,
  input: { label?: string; printerMode?: "system" | "network"; printerName?: string | null; printerHost?: string; printerPort?: number }
): Array<readonly [string, string]> {
  const prefix = billPrinterSettingPrefix(slot);
  return [
    [`${prefix}_label`, input.label || billPrinterDefaultLabel(slot)],
    [`${prefix}_mode`, input.printerMode ?? "system"],
    [`${prefix}_name`, input.printerName ?? ""],
    [`${prefix}_host`, input.printerHost ?? ""],
    [`${prefix}_port`, String(input.printerPort ?? 9100)]
  ];
}

export function printLayoutKey(scope: PrintLayoutSettingsInput["scope"], productionUnitId?: string): string {
  if (scope === "unit") return `print_layout_unit_${productionUnitId ?? ""}`;
  return `print_layout_${scope}`;
}

export function defaultPrintLayout(readSetting: SettingReader, scope: PrintLayoutSettingsInput["scope"], productionUnitId?: string): PrintLayoutSettingsInput {
  return {
    scope,
    productionUnitId,
    billHeader: readSetting("ticket_bill_header") ?? "",
    billFooter: readSetting("ticket_bill_footer") ?? "",
    kotHeader: readSetting("ticket_kot_header") ?? "",
    kotFooter: readSetting("ticket_kot_footer") ?? "",
    restaurantName: readSetting("ticket_restaurant_name") ?? "",
    restaurantAddress: readSetting("ticket_restaurant_address") ?? "",
    taxRegistrationText: readSetting("ticket_tax_registration_text") ?? "",
    lineWidthChars: Number(readSetting("ticket_line_width_chars") ?? 28),
    headerAlign: "center",
    footerAlign: "center",
    sectionStyles: {
      restaurantName: { size: "large", bold: true, align: "center" },
      address: { size: "normal", bold: false, align: "center" },
      header: { size: "normal", bold: false, align: "center" },
      title: { size: "normal", bold: true, align: "center" },
      metadata: { size: "normal", bold: false, align: "left" },
      items: { size: "normal", bold: false, align: "left" },
      totals: { size: "normal", bold: true, align: "left" },
      notes: { size: "normal", bold: true, align: "left" },
      itemNotes: { size: "small", bold: false, align: "left" },
      footer: { size: "normal", bold: false, align: "center" }
    },
    topPaddingLines: 0,
    feedLines: 3,
    showTable: true,
    showCaptain: true,
    showDateTime: true,
    showBillId: true,
    showTaxBreakup: true,
    showPaymentSplit: true,
    showDiscountTip: true,
    showNcReprintRevision: true
  };
}

export function parsePrinterOutputMode(value: string | undefined): PrinterOutputMode | undefined {
  return value === "live" || value === "test" ? value : undefined;
}
