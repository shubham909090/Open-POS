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
    const service = new PrintJobService(database.orm, new FailingPrinterAdapter(), adapter);
    const result = await service.processPending();

    expect(result).toEqual({ printed: 1, failed: 0 });
    expect(adapter.printed).toHaveLength(1);
    expect(database.db.prepare("SELECT status FROM print_jobs LIMIT 1").get()).toEqual({ status: "printed" });

    database.close();
  });

  it("keeps failed jobs retryable when the printer is offline", async () => {
    const { database, orderService } = createTestHub();
    orderService.updatePrinterOutputMode("live");
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

  it("returns the exact print failure message when processing one requested job", async () => {
    const { database, orderService } = createTestHub();
    orderService.updatePrinterOutputMode("live");
    orderService.updateReceiptPrinter({
      printerMode: "network",
      printerHost: "192.168.1.70",
      printerPort: 9100
    });
    const testJob = orderService.enqueueTestBillPrint("admin");
    const service = new PrintJobService(database.orm, new FailingPrinterAdapter());

    const result = await service.processOne(testJob.printJobId);

    expect(result).toEqual({ printed: 0, failed: 1, skipped: false, error: "printer offline" });
    expect(database.db.prepare("SELECT status, last_error FROM print_jobs WHERE id = ?").get(testJob.printJobId)).toEqual({
      status: "failed",
      last_error: "printer offline"
    });

    database.close();
  });

  it("stops automatic retries after five failed print attempts", async () => {
    const { database, orderService } = createTestHub();
    orderService.updatePrinterOutputMode("live");
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
    orderService.updatePrinterOutputMode("live");
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
    orderService.updatePrinterOutputMode("test");
    const adapter = new DryRunPrinterAdapter();
    const retryService = new PrintJobService(database.orm, new FailingPrinterAdapter(), adapter);
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

  it("uses the current printer mode for the next print job without restarting", async () => {
    const { database, orderService } = createTestHub();
    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const printJob = database.db.prepare("SELECT id FROM print_jobs LIMIT 1").get() as { id: string };
    const liveAdapter = new FailingPrinterAdapter();
    const testAdapter = new DryRunPrinterAdapter();
    const service = new PrintJobService(database.orm, liveAdapter, testAdapter);

    orderService.updatePrinterOutputMode("test");
    expect(await service.processPending()).toEqual({ printed: 1, failed: 0 });
    expect(testAdapter.printed).toHaveLength(1);

    orderService.retryPrintJob(printJob.id, { requestedBy: "captain-1" });
    orderService.updatePrinterOutputMode("live");
    expect(await service.processPending()).toEqual({ printed: 0, failed: 1 });
    expect(database.db.prepare("SELECT status, last_error FROM print_jobs WHERE id = ?").get(printJob.id)).toEqual({
      status: "failed",
      last_error: "printer offline"
    });

    database.close();
  });

  it("processes one requested print job without draining older queued jobs", async () => {
    const { database, orderService } = createTestHub();
    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const olderJob = database.db.prepare("SELECT id FROM print_jobs LIMIT 1").get() as { id: string };
    const testJob = orderService.enqueueTestBillPrint("admin");
    const testAdapter = new DryRunPrinterAdapter();
    const service = new PrintJobService(database.orm, new FailingPrinterAdapter(), testAdapter);

    const result = await service.processOne(testJob.printJobId);

    expect(result).toEqual({ printed: 1, failed: 0, skipped: false });
    expect(testAdapter.printed).toHaveLength(1);
    expect(database.db.prepare("SELECT status, attempts FROM print_jobs WHERE id = ?").get(olderJob.id)).toEqual({
      status: "pending",
      attempts: 0
    });
    expect(database.db.prepare("SELECT status, attempts FROM print_jobs WHERE id = ?").get(testJob.printJobId)).toEqual({
      status: "printed",
      attempts: 1
    });

    database.close();
  });
});
