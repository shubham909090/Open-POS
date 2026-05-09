import type { SqliteDatabase } from "../db/database.js";
import type { PrinterAdapter } from "./escpos.js";

interface PrintJobRow {
  id: string;
  printer_host: string | null;
  printer_port: number | null;
  payload: string;
  attempts: number;
}

export class PrintJobService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly adapter: PrinterAdapter
  ) {}

  async processPending(limit = 10): Promise<{ printed: number; failed: number }> {
    const jobs = this.db
      .prepare(
        `SELECT id, printer_host, printer_port, payload, attempts
         FROM print_jobs
         WHERE status IN ('pending', 'failed') AND attempts < 5
         ORDER BY created_at ASC
         LIMIT ?`
      )
      .all(limit) as PrintJobRow[];

    let printed = 0;
    let failed = 0;

    for (const job of jobs) {
      const now = new Date().toISOString();
      this.db
        .prepare("UPDATE print_jobs SET status = 'printing', attempts = attempts + 1, updated_at = ? WHERE id = ?")
        .run(now, job.id);

      try {
        if (!job.printer_host || !job.printer_port) {
          throw new Error("No printer configured for print job");
        }

        await this.adapter.print(job.printer_host, job.printer_port, job.payload);
        this.db
          .prepare("UPDATE print_jobs SET status = 'printed', last_error = NULL, updated_at = ? WHERE id = ?")
          .run(new Date().toISOString(), job.id);
        printed += 1;
      } catch (error) {
        this.db
          .prepare("UPDATE print_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?")
          .run(error instanceof Error ? error.message : "Unknown print error", new Date().toISOString(), job.id);
        failed += 1;
      }
    }

    return { printed, failed };
  }
}
