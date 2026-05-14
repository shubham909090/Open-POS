import { HubDatabase } from "../db/database.js";
import { AuthService } from "../domain/auth-service.js";
import { OrderService } from "../domain/order-service.js";

export function createTestHub() {
  const database = new HubDatabase(":memory:");
  database.migrate();
  database.seedDemoData();
  const authService = new AuthService(database.orm);
  authService.seedAdminDevice("test-admin-token");
  const orderService = new OrderService(database.orm);
  return { database, authService, orderService };
}
