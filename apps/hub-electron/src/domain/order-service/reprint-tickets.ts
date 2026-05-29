import type { BillPrinterSlot, KotType, PrintLayoutSettingsInput } from "@gaurav-pos/shared";
import { eq, sql } from "drizzle-orm";
import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { bills } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { renderBillTicketForPrint, renderKotTicketForPrint, type BillTicket } from "../tickets.js";
import type { BillRow } from "./types.js";

interface PrintTarget {
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
}

interface PrintJobInput extends PrintTarget {
  targetType: "KOT" | "BOT" | "BILL";
  targetId: string;
  productionUnitId: string | null;
  payload: string;
}

type ReprintBillRow = BillRow & { table_name: string };

export function enqueueKotReprint(input: {
  db: SqliteDatabase;
  kotId: string;
  reason: string;
  getPrintLayout: (scope: PrintLayoutSettingsInput["scope"], productionUnitId?: string) => PrintLayoutSettingsInput;
  enqueuePrintJob: (job: PrintJobInput) => string;
}): string {
  const { db, kotId, reason, getPrintLayout, enqueuePrintJob } = input;
  const kot = db
    .prepare(
      `SELECT k.*, o.captain_id, t.name AS table_name, u.name AS unit_name,
        u.printer_host, u.printer_port, u.printer_name
       FROM kots k
       JOIN orders o ON o.id = k.order_id
       JOIN restaurant_tables t ON t.id = o.table_id
       JOIN production_units u ON u.id = k.production_unit_id
       WHERE k.id = ?`
    )
    .get(kotId) as
    | {
        id: string;
        order_id: string;
        production_unit_id: string;
        type: KotType;
        sequence: number;
        created_at: string;
        note: string | null;
        captain_id: string;
        table_name: string;
        unit_name: string;
        printer_host: string;
        printer_port: number;
        printer_name: string | null;
      }
    | undefined;

  if (!kot) throw new DomainError("KOT not found", 404);

  const items = db
    .prepare("SELECT name_snapshot, quantity_delta, note_snapshot FROM kot_items WHERE kot_id = ?")
    .all(kotId) as Array<{ name_snapshot: string; quantity_delta: number; note_snapshot: string | null }>;

  const template = getPrintLayout("unit", kot.production_unit_id);
  const payload = renderKotTicketForPrint({
    sequence: kot.sequence,
    type: "reprint",
    tableName: kot.table_name,
    productionUnitName: kot.unit_name,
    captainId: kot.captain_id,
    createdAt: new Date().toISOString(),
    reason,
    note: kot.note,
    items: items.map((item) => ({
      name: item.name_snapshot,
      quantityDelta: item.quantity_delta,
      note: item.note_snapshot
    })),
    lineWidthChars: template.lineWidthChars,
    headerAlign: template.headerAlign,
    footerAlign: template.footerAlign,
    sectionStyles: template.sectionStyles,
    topPaddingLines: template.topPaddingLines,
    feedLines: template.feedLines,
    showTable: template.showTable,
    showCaptain: template.showCaptain,
    showDateTime: template.showDateTime,
    header: template.kotHeader,
    footer: template.kotFooter
  });

  return enqueuePrintJob({
    targetType: "KOT",
    targetId: kot.id,
    productionUnitId: kot.production_unit_id,
    printerHost: kot.printer_host,
    printerPort: kot.printer_port,
    printerName: kot.printer_name,
    payload
  });
}

export function enqueueBillReprint(input: {
  orm: HubOrm;
  db: SqliteDatabase;
  billId: string;
  suffix: string;
  printerSlot: BillPrinterSlot;
  buildBillTicket: (input: { bill: ReprintBillRow; tableName: string; createdAt: string }) => BillTicket;
  resolveBillPrinter: (slot: BillPrinterSlot) => PrintTarget;
  enqueuePrintJob: (job: PrintJobInput) => string;
}): string {
  const { orm, db, billId, suffix, printerSlot, buildBillTicket, resolveBillPrinter, enqueuePrintJob } = input;
  const bill = db
    .prepare(
      `SELECT b.*, t.name AS table_name
         FROM bills b
         JOIN orders o ON o.id = b.order_id
         JOIN restaurant_tables t ON t.id = o.table_id
         WHERE b.id = ?`
    )
    .get(billId) as ReprintBillRow | undefined;

  if (!bill) throw new DomainError("Bill not found", 404);

  const payload = `${renderBillTicketForPrint(
    buildBillTicket({
      bill,
      tableName: bill.table_name,
      createdAt: bill.created_at
    })
  )}${suffix ? `\n${suffix}` : ""}`;

  const printJobId = enqueuePrintJob({
    targetType: "BILL",
    targetId: billId,
    productionUnitId: null,
    ...resolveBillPrinter(printerSlot),
    payload
  });

  orm.update(bills).set({ printCount: sql`${bills.printCount} + 1` }).where(eq(bills.id, billId)).run();
  return printJobId;
}
