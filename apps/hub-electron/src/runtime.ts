import { createHubServer } from "./api/server.js";
import { readAppMetadata } from "./app-metadata.js";
import { loadHubConfig } from "./config.js";
import { BackupService } from "./db/backup-service.js";
import { HubDatabase } from "./db/database.js";
import { currentDbSchemaVersion } from "./db/schema-version.js";
import { AuthService } from "./domain/auth-service.js";
import { EventBus } from "./domain/event-bus.js";
import { OrderService } from "./domain/order-service.js";
import { DryRunPrinterAdapter, RoutedPrinterAdapter } from "./printing/escpos.js";
import { PrintJobService } from "./printing/print-job-service.js";
import { ConvexSyncBridge } from "./sync/convex-sync.js";
import { AppUpdateService } from "./update/app-update-service.js";

type SyncBridgeLike = Pick<ConvexSyncBridge, "pushPending" | "pullCloudSnapshot">;
type SyncLogger = { warn: (error: unknown, message: string) => void };

export function createSyncTick(syncBridge: SyncBridgeLike, log: SyncLogger) {
  let running = false;
  return async () => {
    if (running) return { skipped: true, reason: "already_running" as const };
    running = true;
    try {
      const pushed = await syncBridge.pushPending();
      const pulled = await syncBridge.pullCloudSnapshot();
      return { skipped: false, pushed, pulled };
    } catch (error) {
      log.warn(error, "Convex sync skipped or failed");
      return { skipped: false, error };
    } finally {
      running = false;
    }
  };
}

export async function startHub(options: { requestRestart?: () => void } = {}) {
  const config = loadHubConfig();
  BackupService.applyPendingReset(config.databasePath, config.backupDir);
  BackupService.applyPendingRestore(config.databasePath, config.backupDir);
  const database = new HubDatabase(config.databasePath);
  const appSchemaVersion = currentDbSchemaVersion();
  database.assertCompatibleAppSchema(appSchemaVersion);
  database.migrate();
  database.markAppSchemaVersion(appSchemaVersion);
  const backupService = new BackupService(database, config.databasePath, config.backupDir);
  const appMetadata = readAppMetadata();
  const appUpdateService = new AppUpdateService({
    database,
    backupService,
    updateDir: config.updateDir,
    appVersion: appMetadata.version,
    dbSchemaVersion: appSchemaVersion,
    databasePath: config.databasePath,
    exitApp: () => {
      setTimeout(() => process.exit(0), 500).unref();
    }
  });

  const printJobService = new PrintJobService(database.orm, new RoutedPrinterAdapter(), new DryRunPrinterAdapter());
  const eventBus = new EventBus<unknown>();
  const authService = new AuthService(database.orm);
  authService.seedAdminDevice(config.adminToken);
  const orderService = new OrderService(database.orm);
  orderService.ensurePrinterOutputMode(config.printerOutputModeDefault);
  orderService.ensureHubConnectionSettings({
    cloudUrl: config.convexHttpUrl ?? "",
    installationId: config.installationId ?? "",
    syncSecret: config.posSyncSecret ?? "",
    hubPublicUrl: config.publicUrl ?? ""
  });
  const syncBridge = new ConvexSyncBridge(
    database.orm,
    config.convexHttpUrl,
    config.posSyncSecret,
    config.installationId,
    () => orderService.getHubConnectionRuntimeSettings()
  );
  const app = createHubServer({
    database,
    backupService,
    appUpdateService,
    authService,
    orderService,
    printJobService,
    syncBridge,
    eventBus,
    publicUrl: config.publicUrl,
    requestRestart: options.requestRestart
  });

  await app.listen({ host: config.host, port: config.port });
  const runSyncTick = createSyncTick(syncBridge, app.log);
  const syncInterval = setInterval(() => {
    void runSyncTick();
  }, 60_000);
  syncInterval.unref();

  return {
    app,
    database,
    url: `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}`
  };
}
