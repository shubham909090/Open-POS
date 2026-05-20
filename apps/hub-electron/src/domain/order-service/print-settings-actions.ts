import type {
  BillPrinterSlot,
  DomainEvent,
  PrintLayoutSettingsInput,
  PrinterOutputMode,
  UpdateBillPrintersInput,
  UpdateReceiptPrinterInput
} from "@gaurav-pos/shared";

import type { SqliteDatabase } from "../../db/database.js";
import { DomainError } from "../errors.js";
import { buildTestBillPrintPayload, buildTestKotPrintPayload } from "./print-test-payloads.js";
import type { PrintJobInput } from "./print-job-records.js";
import {
  billPrinterSettingValues,
  parsePrinterOutputMode,
  readBillPrinterProfile
} from "./printer-settings.js";
import { getFirstActiveProductionUnit } from "./production-unit-queries.js";
import type { BillPrinterProfile, BillPrinterProfiles } from "./types.js";

export type PrintSettingsActionContext = {
  db: SqliteDatabase;
  readSetting: (key: string) => string | undefined;
  writeSetting: (key: string, value: string) => void;
  getPrintLayout: (scope: PrintLayoutSettingsInput["scope"], productionUnitId?: string) => PrintLayoutSettingsInput;
  enqueuePrintJob: (input: PrintJobInput) => string;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function getReceiptPrinter(ctx: PrintSettingsActionContext): {
  printerMode: "system" | "network";
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
} {
  const profile = getBillPrinterProfile(ctx, "default");
  return {
    printerMode: profile.printerMode,
    printerHost: profile.printerHost,
    printerPort: profile.printerPort,
    printerName: profile.printerName
  };
}

export function getBillPrinters(ctx: PrintSettingsActionContext): BillPrinterProfiles {
  return {
    default: getBillPrinterProfile(ctx, "default"),
    alternate: getBillPrinterProfile(ctx, "alternate")
  };
}

export function updateReceiptPrinter(ctx: PrintSettingsActionContext, input: UpdateReceiptPrinterInput): UpdateReceiptPrinterInput {
  const current = getBillPrinterProfile(ctx, "default");
  updateBillPrinterProfile(
    ctx,
    "default",
    {
      label: current.label,
      printerMode: input.printerMode ?? "system",
      printerName: input.printerName,
      printerHost: input.printerHost,
      printerPort: input.printerPort
    }
  );
  ctx.appendEvent("receipt_printer.updated", "hub_setting", "receipt_printer", input);
  return input;
}

export function updateBillPrinters(ctx: PrintSettingsActionContext, input: UpdateBillPrintersInput): BillPrinterProfiles {
  const run = ctx.db.transaction(() => {
    updateBillPrinterProfile(ctx, "default", input.default);
    updateBillPrinterProfile(ctx, "alternate", input.alternate);
    ctx.appendEvent("receipt_printer.updated", "hub_setting", "receipt_printer", input);
  });
  run();
  return getBillPrinters(ctx);
}

export function getBillPrinterProfile(ctx: PrintSettingsActionContext, slot: BillPrinterSlot): BillPrinterProfile {
  return readBillPrinterProfile(ctx.readSetting, slot);
}

export function resolveBillPrinter(
  ctx: PrintSettingsActionContext,
  slot: BillPrinterSlot = "default"
): {
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
} {
  const profile = getBillPrinterProfile(ctx, slot);
  if (!profile.configured) {
    if (slot === "default" && getPrinterOutputMode(ctx) === "test") {
      return { printerHost: null, printerPort: null, printerName: null };
    }
    throw new DomainError(`${profile.label} is not configured for bill printing`, 400);
  }
  return {
    printerHost: profile.printerMode === "network" ? profile.printerHost : null,
    printerPort: profile.printerMode === "network" ? profile.printerPort ?? 9100 : null,
    printerName: profile.printerMode === "system" ? profile.printerName : null
  };
}

export function getPrinterOutputMode(ctx: PrintSettingsActionContext): PrinterOutputMode {
  return readPrinterOutputMode(ctx) ?? "test";
}

export function ensurePrinterOutputMode(ctx: PrintSettingsActionContext, defaultMode: PrinterOutputMode): PrinterOutputMode {
  const current = readPrinterOutputMode(ctx);
  if (current) return current;
  ctx.writeSetting("printer_output_mode", defaultMode);
  return defaultMode;
}

export function updatePrinterOutputMode(ctx: PrintSettingsActionContext, mode: PrinterOutputMode): { mode: PrinterOutputMode } {
  ctx.writeSetting("printer_output_mode", mode);
  ctx.appendEvent("printer_output_mode.updated", "hub_setting", "printer_output_mode", { mode });
  return { mode };
}

export function enqueueTestBillPrint(ctx: PrintSettingsActionContext, requestedBy: string, printerSlot: BillPrinterSlot = "default"): { printJobId: string } {
  const template = ctx.getPrintLayout("receipt");
  const printJobId = ctx.enqueuePrintJob({
    targetType: "BILL",
    targetId: "test-bill",
    productionUnitId: null,
    ...resolveBillPrinter(ctx, printerSlot),
    payload: buildTestBillPrintPayload(template)
  });
  ctx.appendEvent("print_job.test_bill_queued", "print_job", printJobId, { requestedBy, printJobId });
  return { printJobId };
}

export function enqueueTestKotPrint(ctx: PrintSettingsActionContext, requestedBy: string): { printJobId: string } {
  const unit = getFirstActiveProductionUnit(ctx.db);
  const template = ctx.getPrintLayout(unit?.id ? "unit" : "default", unit?.id);
  const printJobId = ctx.enqueuePrintJob({
    targetType: "KOT",
    targetId: "test-kot",
    productionUnitId: unit?.id ?? null,
    printerHost: unit?.printer_host ?? null,
    printerPort: unit?.printer_port ?? null,
    printerName: unit?.printer_name ?? null,
    payload: buildTestKotPrintPayload({ requestedBy, template, unit })
  });
  ctx.appendEvent("print_job.test_kot_queued", "print_job", printJobId, { requestedBy, printJobId, productionUnitId: unit?.id ?? null });
  return { printJobId };
}

function updateBillPrinterProfile(
  ctx: PrintSettingsActionContext,
  slot: BillPrinterSlot,
  input: { label?: string; printerMode?: "system" | "network"; printerName?: string | null; printerHost?: string; printerPort?: number }
): void {
  for (const [key, value] of billPrinterSettingValues(slot, input)) {
    ctx.writeSetting(key, value);
  }
}

function readPrinterOutputMode(ctx: PrintSettingsActionContext): PrinterOutputMode | undefined {
  return parsePrinterOutputMode(ctx.readSetting("printer_output_mode"));
}
