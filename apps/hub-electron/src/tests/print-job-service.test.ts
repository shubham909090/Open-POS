import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";
import type { PrinterAdapter } from "../printing/escpos.js";
import { DryRunPrinterAdapter } from "../printing/escpos.js";
import { PrintJobService } from "../printing/print-job-service.js";

class FailingPrinterAdapter implements PrinterAdapter {
  async print(): Promise<void> {
    throw new Error("printer offline");
  }
}

describe("PrintJobService", () => {
  it("marks pending jobs as printed when the adapter succeeds", async () => {
    const { database, orderService } = createTestHub();
    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    const adapter = new DryRunPrinterAdapter();
    const service = new PrintJobService(database.orm, adapter);
    const result = await service.processPending();

    expect(result).toEqual({ printed: 1, failed: 0 });
    expect(adapter.printed).toHaveLength(1);
    expect(database.db.prepare("SELECT status FROM print_jobs LIMIT 1").get()).toEqual({ status: "printed" });

    database.close();
  });

  it("keeps failed jobs retryable when the printer is offline", async () => {
    const { database, orderService } = createTestHub();
    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    const service = new PrintJobService(database.orm, new FailingPrinterAdapter());
    const result = await service.processPending();

    expect(result).toEqual({ printed: 0, failed: 1 });
    expect(database.db.prepare("SELECT status, attempts, last_error FROM print_jobs LIMIT 1").get()).toEqual({
      status: "failed",
      attempts: 1,
      last_error: "printer offline"
    });

    database.close();
  });

  it("stops automatic retries after five failed print attempts", async () => {
    const { database, orderService } = createTestHub();
    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    const service = new PrintJobService(database.orm, new FailingPrinterAdapter());
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.processPending();
    }
    const skipped = await service.processPending();

    expect(skipped).toEqual({ printed: 0, failed: 0 });
    expect(database.db.prepare("SELECT status, attempts, last_error FROM print_jobs LIMIT 1").get()).toEqual({
      status: "failed",
      attempts: 5,
      last_error: "printer offline"
    });

    database.close();
  });

  it("prints a job after a manual retry resets the retry cap", async () => {
    const { database, orderService } = createTestHub();
    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const printJob = database.db.prepare("SELECT id FROM print_jobs LIMIT 1").get() as { id: string };

    const failingService = new PrintJobService(database.orm, new FailingPrinterAdapter());
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await failingService.processPending();
    }

    orderService.retryPrintJob(printJob.id, { requestedBy: "captain-1" });
    const adapter = new DryRunPrinterAdapter();
    const retryService = new PrintJobService(database.orm, adapter);
    const result = await retryService.processPending();

    expect(result).toEqual({ printed: 1, failed: 0 });
    expect(adapter.printed).toHaveLength(1);
    expect(database.db.prepare("SELECT status, attempts, last_error FROM print_jobs WHERE id = ?").get(printJob.id)).toEqual({
      status: "printed",
      attempts: 1,
      last_error: null
    });

    database.close();
  });
});
