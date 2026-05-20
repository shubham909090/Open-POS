import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { printJobs } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";

export interface PrintJobInput {
  targetType: "KOT" | "BOT" | "BILL";
  targetId: string;
  productionUnitId: string | null;
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
  payload: string;
}

export function enqueuePrintJob(orm: HubOrm, input: PrintJobInput): string {
  const id = makeId("print");
  const now = new Date().toISOString();
  orm
    .insert(printJobs)
    .values({
      id,
      targetType: input.targetType,
      targetId: input.targetId,
      productionUnitId: input.productionUnitId,
      printerHost: input.printerHost,
      printerPort: input.printerPort,
      printerName: input.printerName,
      status: "pending",
      attempts: 0,
      payload: input.payload,
      createdAt: now,
      updatedAt: now
    })
    .run();
  return id;
}

export function retryPrintJob(db: SqliteDatabase, printJobId: string): void {
  const now = new Date().toISOString();
  const result = db
    .prepare("UPDATE print_jobs SET status = 'pending', attempts = 0, last_error = NULL, updated_at = ? WHERE id = ?")
    .run(now, printJobId);
  if (result.changes === 0) throw new DomainError("Print job not found", 404);
}
