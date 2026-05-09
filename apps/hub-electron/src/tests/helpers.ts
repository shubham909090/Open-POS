import { HubDatabase } from "../db/database.js";
import { OrderService } from "../domain/order-service.js";

export function createTestHub() {
  const database = new HubDatabase(":memory:");
  database.migrate();
  database.seedDemoData();
  const orderService = new OrderService(database.db);
  orderService.openPosDay({
    outletId: "outlet-test",
    businessDate: "2026-05-09",
    openingCashPaise: 100_000,
    openedBy: "admin"
  });
  return { database, orderService };
}
