import type { FastifyInstance } from "fastify";
import type { BackupService } from "../db/backup-service.js";
import type { HubDatabase } from "../db/database.js";
import type { LocalDeviceSession } from "../domain/auth-service.js";
import type { AuthService } from "../domain/auth-service.js";
import type { EventBus } from "../domain/event-bus.js";
import type { OrderService } from "../domain/order-service.js";
import type { PrintJobService } from "../printing/print-job-service.js";
import type { ConvexSyncBridge } from "../sync/convex-sync.js";
import type { AppUpdateService } from "../update/app-update-service.js";

export type HubServerInput = {
  database: HubDatabase;
  backupService: BackupService;
  appUpdateService?: AppUpdateService;
  authService: AuthService;
  orderService: OrderService;
  printJobService: PrintJobService;
  syncBridge?: ConvexSyncBridge;
  eventBus: EventBus<unknown>;
  publicUrl?: string;
  requestRestart?: () => void;
};

export type HeaderRequest = {
  headers: Record<string, string | string[] | undefined>;
};

export type HubPreHandler = (request: HeaderRequest) => void | Promise<unknown>;

export type HubRouteAuth = {
  anyRole: HubPreHandler;
  adminOnly: HubPreHandler;
  captainOrAdmin: HubPreHandler;
  orderRole: HubPreHandler;
  orderMoveRole: HubPreHandler;
  kitchenRole: HubPreHandler;
  getSession: (request: HeaderRequest) => LocalDeviceSession;
};

export type HubRouteContext = {
  app: FastifyInstance;
  input: HubServerInput;
  auth: HubRouteAuth;
};
