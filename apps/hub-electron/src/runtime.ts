import { createHubServer } from "./api/server.js";
import { loadHubConfig } from "./config.js";
import { BackupService } from "./db/backup-service.js";
import { HubDatabase } from "./db/database.js";
import { AuthService } from "./domain/auth-service.js";
import { EventBus } from "./domain/event-bus.js";
import { OrderService } from "./domain/order-service.js";
import { DryRunPrinterAdapter, RoutedPrinterAdapter } from "./printing/escpos.js";
import { PrintJobService } from "./printing/print-job-service.js";
import { ConvexSyncBridge } from "./sync/convex-sync.js";

export async function startHub() {
  const config = loadHubConfig();
  BackupService.applyPendingRestore(config.databasePath, config.backupDir);
  const database = new HubDatabase(config.databasePath);
  database.migrate();
  database.seedDemoData();
  const backupService = new BackupService(database, config.databasePath, config.backupDir);

  const printerAdapter = config.printerDryRun ? new DryRunPrinterAdapter() : new RoutedPrinterAdapter();
  const printJobService = new PrintJobService(database.orm, printerAdapter);
  const eventBus = new EventBus<unknown>();
  const authService = new AuthService(database.orm);
  authService.seedAdminDevice(config.adminToken);
  const orderService = new OrderService(database.orm);
  const syncBridge = new ConvexSyncBridge(database.orm, config.convexHttpUrl, config.posSyncSecret, config.installationId);
  const app = createHubServer({ database, backupService, authService, orderService, printJobService, syncBridge, eventBus });

  await app.listen({ host: config.host, port: config.port });
  const syncInterval = setInterval(() => {
    void syncBridge.pushPending().catch((error) => app.log.warn(error, "Convex sync skipped or failed"));
  }, 60_000);
  syncInterval.unref();

  return {
    app,
    database,
    url: `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}`
  };
}
