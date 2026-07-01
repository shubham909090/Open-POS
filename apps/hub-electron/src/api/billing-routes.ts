import {
  billPrintDestinationSchema,
  generateBillSchema,
  historyEditBillSchema,
  markNcBillSchema,
  reprintBillSchema,
  reviseBillSchema,
  settleBillSchema
} from "@gaurav-pos/shared";
import type { WithIdempotency } from "./idempotency.js";
import type { PrintJobTotals } from "./print-job-processing.js";
import type { HubRouteContext } from "./route-context.js";

type BillingRouteContext = HubRouteContext & {
  withIdempotency: WithIdempotency;
  processCreatedPrintJobs: (printJobIds: string[]) => Promise<PrintJobTotals>;
};

export function registerBillingRoutes({ app, input, auth, withIdempotency, processCreatedPrintJobs }: BillingRouteContext): void {
  const { captainOrAdmin, getSession } = auth;

  app.post("/bills/:billId/reprint", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `bills.reprint.${params.billId}`, () =>
      input.orderService.reprintBill(
        params.billId,
        reprintBillSchema.parse({ ...(request.body as Record<string, unknown>), requestedBy: session.name }),
        session
      )
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "bill.reprinted", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/bills/:billId/history-reprint", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const body = billPrintDestinationSchema.parse(request.body ?? {});
    const { result, replayed } = await withIdempotency(request, `bills.history-reprint.${params.billId}`, () =>
      input.orderService.reprintBillFromHistory(params.billId, session.name, body.printerSlot)
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "bill.history_reprinted", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/bills/:billId/print", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const body = billPrintDestinationSchema.parse(request.body ?? {});
    const { result, replayed } = await withIdempotency(request, `bills.print.${params.billId}`, () =>
      input.orderService.printBill(params.billId, session.name, body.printerSlot)
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "bill.printed", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/bills/:billId/revise", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `bills.revise.${params.billId}`, () =>
      input.orderService.reviseBill(params.billId, reviseBillSchema.parse(request.body), session)
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs(result.printJobIds);
    if (!replayed) input.eventBus.publish({ type: "bill.revised", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/bills/:billId/history-edit", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `bills.history-edit.${params.billId}`, () =>
      input.orderService.editHistoryBill(params.billId, historyEditBillSchema.parse(request.body), session)
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "bill.history_edited", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/bills/:billId/nc", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const { result, replayed } = await withIdempotency(request, `bills.nc.${params.billId}`, () =>
      input.orderService.markBillNc(params.billId, markNcBillSchema.parse(request.body))
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "bill.nc_marked", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/bills/:orderId/generate", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { orderId: string };
    const body = generateBillSchema.parse(request.body ?? {});
    const { result, replayed } = await withIdempotency(request, `bills.generate.${params.orderId}`, () =>
      input.orderService.generateBill(params.orderId, body.printerSlot, body)
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "bill.generated", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/bills/:billId/settle", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `bills.settle.${params.billId}`, () =>
      input.orderService.settleBill(
        params.billId,
        settleBillSchema.parse({ ...(request.body as Record<string, unknown>), receivedBy: session.name })
      )
    );
    if (!replayed) input.eventBus.publish({ type: "bill.settled", result });
    return result;
  });
}
