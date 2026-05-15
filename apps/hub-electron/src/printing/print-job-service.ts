import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { HubOrm } from "../db/database.js";
import { eventLog, hubSettings, printJobs, syncOutbox } from "../db/drizzle-schema.js";
import { makeId } from "../domain/ids.js";
import { DryRunPrinterAdapter, type PrinterAdapter } from "./escpos.js";

type PrinterOutputMode = "test" | "live";

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
    private readonly liveAdapter: PrinterAdapter,
    private readonly testAdapter: PrinterAdapter = new DryRunPrinterAdapter()
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
      const result = await this.processJobRow(job);
      printed += result.printed;
      failed += result.failed;
    }

    return { printed, failed };
  }

  async processOne(printJobId: string): Promise<{ printed: number; failed: number; skipped: boolean }> {
    const job = this.db
      .select({
        id: printJobs.id,
        printerHost: printJobs.printerHost,
        printerPort: printJobs.printerPort,
        printerName: printJobs.printerName,
        payload: printJobs.payload,
        attempts: printJobs.attempts
      })
      .from(printJobs)
      .where(and(eq(printJobs.id, printJobId), inArray(printJobs.status, ["pending", "failed"]), lt(printJobs.attempts, 5)))
      .get() as PrintJobRow | undefined;

    if (!job) return { printed: 0, failed: 0, skipped: true };
    return { ...(await this.processJobRow(job)), skipped: false };
  }

  private async processJobRow(job: PrintJobRow): Promise<{ printed: number; failed: number }> {
    const mode = this.printerOutputMode();
    const adapter = mode === "test" ? this.testAdapter : this.liveAdapter;
    const now = new Date().toISOString();
    this.db
      .update(printJobs)
      .set({ status: "printing", attempts: sql`${printJobs.attempts} + 1`, updatedAt: now })
      .where(eq(printJobs.id, job.id))
      .run();

    try {
      if (mode === "live" && !job.printerName && (!job.printerHost || !job.printerPort)) {
        throw new Error("No printer configured for print job");
      }

      await adapter.print({
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
      return { printed: 1, failed: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown print error";
      this.db
        .update(printJobs)
        .set({
          status: "failed",
          lastError: message,
          updatedAt: new Date().toISOString()
        })
        .where(eq(printJobs.id, job.id))
        .run();
      this.appendFailureEvent(job.id, message);
      return { printed: 0, failed: 1 };
    }
  }

  private printerOutputMode(): PrinterOutputMode {
    const row = this.db.select({ value: hubSettings.value }).from(hubSettings).where(eq(hubSettings.key, "printer_output_mode")).get();
    return row?.value === "live" ? "live" : "test";
  }

  private appendFailureEvent(printJobId: string, message: string): void {
    const now = new Date().toISOString();
    const event = {
      eventId: makeId("evt"),
      type: "print_job.failed",
      aggregateType: "print_job",
      aggregateId: printJobId,
      payload: JSON.stringify({ printJobId, message }),
      createdAt: now
    };
    this.db.insert(eventLog).values(event).run();
    this.db
      .insert(syncOutbox)
      .values({ eventId: event.eventId, status: "pending", attempts: 0, createdAt: now, updatedAt: now })
      .run();
  }
}
