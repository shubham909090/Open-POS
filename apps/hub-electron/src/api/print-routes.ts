import { billPrintDestinationSchema, retryPrintJobSchema } from "@gaurav-pos/shared";
import type { HubRouteContext } from "./route-context.js";

export function registerPrintRoutes({ app, input, auth }: HubRouteContext): void {
  const { captainOrAdmin, getSession } = auth;

  app.post("/print-jobs/process", { preHandler: captainOrAdmin }, async () => input.printJobService.processPending());
  app.post("/print-jobs/test-bill", { preHandler: captainOrAdmin }, async (request) => {
    const session = getSession(request);
    const body = billPrintDestinationSchema.parse(request.body ?? {});
    const result = input.orderService.enqueueTestBillPrint(session.name, body.printerSlot);
    const processed = await input.printJobService.processOne(result.printJobId);
    input.eventBus.publish({ type: "print_job.test_bill_queued", result });
    return { ...result, processed };
  });
  app.post("/print-jobs/test-kot", { preHandler: captainOrAdmin }, async (request) => {
    const session = getSession(request);
    const result = input.orderService.enqueueTestKotPrint(session.name);
    const processed = await input.printJobService.processOne(result.printJobId);
    input.eventBus.publish({ type: "print_job.test_kot_queued", result });
    return { ...result, processed };
  });
  app.get("/print-jobs", { preHandler: captainOrAdmin }, async (request) => {
    const query = request.query as { limit?: string };
    return input.orderService.listPrintJobs(Number(query.limit ?? 50));
  });
  app.post("/print-jobs/:id/retry", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.retryPrintJob(params.id, retryPrintJobSchema.parse(request.body));
    input.eventBus.publish({ type: "print_job.retry_requested", result });
    return result;
  });
}
