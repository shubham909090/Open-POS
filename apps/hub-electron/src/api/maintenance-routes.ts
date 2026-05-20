import { createBackupSchema, fullResetSchema, scheduleRestoreSchema } from "@gaurav-pos/shared";
import { z } from "zod";
import { DomainError } from "../domain/errors.js";
import type { HubRouteContext } from "./route-context.js";

const updatePackagePathSchema = z.object({
  packagePath: z.string().trim().min(1)
});

const updateInstallerPathSchema = z.object({
  installerPath: z.string().trim().min(1)
});

const githubUpdateInstallSchema = z.object({
  tagName: z.string().trim().min(1),
  assetName: z.string().trim().min(1),
  expectedVersion: z.string().trim().min(1)
});

export function registerMaintenanceRoutes({ app, input, auth }: HubRouteContext): void {
  const { adminOnly } = auth;

  function requireAppUpdateService() {
    if (!input.appUpdateService) throw new DomainError("App updates are not configured", 503);
    return input.appUpdateService;
  }

  app.get("/backups", { preHandler: adminOnly }, async () => input.backupService.listBackups());
  app.post("/backups", { preHandler: adminOnly }, async (request) => {
    const body = createBackupSchema.parse(request.body ?? {});
    return input.backupService.createBackup(body.label);
  });
  app.post("/backups/restore", { preHandler: adminOnly }, async (request) => {
    const body = scheduleRestoreSchema.parse(request.body);
    return input.backupService.scheduleRestore(body.fileName);
  });

  app.get("/system/update/status", { preHandler: adminOnly }, async () => requireAppUpdateService().status());
  app.get("/system/update/github/latest", { preHandler: adminOnly }, async () => requireAppUpdateService().checkGithubLatest());
  app.post("/system/update/validate", { preHandler: adminOnly }, async (request) => {
    const body = updatePackagePathSchema.parse(request.body);
    return requireAppUpdateService().validatePackage(body.packagePath);
  });
  app.post("/system/update/register-baseline", { preHandler: adminOnly }, async (request) => {
    const body = updatePackagePathSchema.parse(request.body);
    return requireAppUpdateService().registerBaseline(body.packagePath);
  });
  app.post("/system/update/register-installer-baseline", { preHandler: adminOnly }, async (request) => {
    const body = updateInstallerPathSchema.parse(request.body);
    return requireAppUpdateService().registerInstallerBaseline(body.installerPath);
  });
  app.post("/system/update/install", { preHandler: adminOnly }, async (request) => {
    const body = updatePackagePathSchema.parse(request.body);
    const managerPin = String(request.headers["x-manager-pin"] ?? "");
    input.orderService.verifyManagerPinForSession(managerPin);
    return requireAppUpdateService().installUpdate(body.packagePath);
  });
  app.post("/system/update/github/install", { preHandler: adminOnly }, async (request) => {
    const managerPin = String(request.headers["x-manager-pin"] ?? "");
    input.orderService.verifyManagerPinForSession(managerPin);
    const body = githubUpdateInstallSchema.parse(request.body ?? {});
    return requireAppUpdateService().installGithubUpdate(body);
  });
  app.post("/system/update/rollback", { preHandler: adminOnly }, async (request) => {
    const managerPin = String(request.headers["x-manager-pin"] ?? "");
    input.orderService.verifyManagerPinForSession(managerPin);
    return requireAppUpdateService().rollback();
  });
  app.post("/system/full-reset", { preHandler: adminOnly }, async (request) => {
    const body = fullResetSchema.parse(request.body);
    input.orderService.verifyManagerPinForSession(body.managerApproval.pin);
    const result = input.backupService.scheduleFullReset(body.includeBackups);
    setTimeout(() => {
      if (input.requestRestart) input.requestRestart();
    }, 250).unref();
    return result;
  });
}
