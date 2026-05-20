import { reportRangeQuerySchema } from "@gaurav-pos/shared";
import { DomainError } from "../domain/errors.js";
import type { HubRouteContext } from "./route-context.js";

export function registerReportRoutes({ app, input, auth }: HubRouteContext): void {
  const { captainOrAdmin } = auth;

  app.get("/business-day/current-summary", { preHandler: captainOrAdmin }, async () => input.orderService.getCurrentBusinessDaySummary());
  app.get("/reports/daily", { preHandler: captainOrAdmin }, async () => {
    const result = input.orderService.listDailyReports();
    void input.syncBridge?.pushPending().catch((error) => app.log.warn(error, "Daily report sync will retry later"));
    return result;
  });
  app.get("/reports/daily/:posDayId", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { posDayId: string };
    return input.orderService.getDailyReport(params.posDayId);
  });
  app.get("/reports/range", { preHandler: captainOrAdmin }, async (request) => {
    const parsed = reportRangeQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new DomainError(parsed.error.issues[0]?.message ?? "Invalid report range", 400);
    return input.orderService.getRangeReport(parsed.data);
  });
  app.get("/reports/alcohol-stock-movements", { preHandler: captainOrAdmin }, async (request) => {
    const query = request.query as { limit?: string };
    return input.orderService.listAlcoholStockMovements(Number(query.limit ?? 100));
  });
}
