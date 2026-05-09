import { createHubServer } from "./api/server.js";
import { loadHubConfig } from "./config.js";
import { HubDatabase } from "./db/database.js";
import { EventBus } from "./domain/event-bus.js";
import { OrderService } from "./domain/order-service.js";
import { DryRunPrinterAdapter, LanEscposPrinterAdapter } from "./printing/escpos.js";
import { PrintJobService } from "./printing/print-job-service.js";
import { ConvexSyncBridge } from "./sync/convex-sync.js";

export async function startHub() {
  const config = loadHubConfig();
  const database = new HubDatabase(config.databasePath);
  database.migrate();
  database.seedDemoData();

  const printerAdapter = config.printerDryRun ? new DryRunPrinterAdapter() : new LanEscposPrinterAdapter();
  const printJobService = new PrintJobService(database.db, printerAdapter);
  const eventBus = new EventBus<unknown>();
  const orderService = new OrderService(database.db);
  const syncBridge = new ConvexSyncBridge(database.db, config.convexHttpUrl, config.posSyncSecret);
  const app = createHubServer({ database, orderService, printJobService, syncBridge, eventBus });

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
