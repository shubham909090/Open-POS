import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { HubOrm } from "../db/database.js";
import { printJobs } from "../db/drizzle-schema.js";
import type { PrinterAdapter } from "./escpos.js";

interface PrintJobRow {
  id: string;
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
  payload: string;
  attempts: number;
}

export class PrintJobService {
  constructor(
    private readonly db: HubOrm,
    private readonly adapter: PrinterAdapter
  ) {}

  async processPending(limit = 10): Promise<{ printed: number; failed: number }> {
    const jobs = this.db
      .select({
        id: printJobs.id,
        printerHost: printJobs.printerHost,
        printerPort: printJobs.printerPort,
        printerName: printJobs.printerName,
        payload: printJobs.payload,
        attempts: printJobs.attempts
      })
      .from(printJobs)
      .where(and(inArray(printJobs.status, ["pending", "failed"]), lt(printJobs.attempts, 5)))
      .orderBy(asc(printJobs.createdAt))
      .limit(limit)
      .all() as PrintJobRow[];

    let printed = 0;
    let failed = 0;

    for (const job of jobs) {
      const now = new Date().toISOString();
      this.db
        .update(printJobs)
        .set({ status: "printing", attempts: sql`${printJobs.attempts} + 1`, updatedAt: now })
        .where(eq(printJobs.id, job.id))
        .run();

      try {
        if (!job.printerName && (!job.printerHost || !job.printerPort)) {
          throw new Error("No printer configured for print job");
        }

        await this.adapter.print({
          printerHost: job.printerHost,
          printerPort: job.printerPort,
          printerName: job.printerName,
          payload: job.payload
        });
        this.db
          .update(printJobs)
          .set({ status: "printed", lastError: null, updatedAt: new Date().toISOString() })
          .where(eq(printJobs.id, job.id))
          .run();
        printed += 1;
      } catch (error) {
        this.db
          .update(printJobs)
          .set({
            status: "failed",
            lastError: error instanceof Error ? error.message : "Unknown print error",
            updatedAt: new Date().toISOString()
          })
          .where(eq(printJobs.id, job.id))
          .run();
        failed += 1;
      }
    }

    return { printed, failed };
  }
}
