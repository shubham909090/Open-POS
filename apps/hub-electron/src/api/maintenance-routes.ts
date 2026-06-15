import { cancelPendingRestoreSchema, createBackupSchema, deleteBackupSchema, fullResetSchema, restartPendingRestoreSchema, scheduleRestoreSchema } from "@gaurav-pos/shared";
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
  const backupFailure = (error: unknown): DomainError => new DomainError(error instanceof Error ? error.message : "Backup operation failed", 400);

  app.get("/backups", { preHandler: adminOnly }, async () => input.backupService.listBackups());
  app.post("/backups", { preHandler: adminOnly }, async (request) => {
    const body = createBackupSchema.parse(request.body ?? {});
    try {
      return await input.backupService.createBackup(body.label);
    } catch (error) {
      throw backupFailure(error);
    }
  });
  app.get("/backups/restore-pending", { preHandler: adminOnly }, async () => input.backupService.getPendingRestore());
  app.delete("/backups/restore-pending", { preHandler: adminOnly }, async (request) => {
    const body = cancelPendingRestoreSchema.parse(request.body ?? {});
    input.orderService.verifyMasterApprovalForAction(body.masterApproval, "backup_restore.cancel", "hub_backup", "restore-pending", body.masterApproval?.approvedBy ?? "owner");
    return input.backupService.cancelPendingRestore();
  });
  app.post("/backups/restore-pending/restart", { preHandler: adminOnly }, async (request) => {
    const body = restartPendingRestoreSchema.parse(request.body ?? {});
    input.orderService.verifyMasterApprovalForAction(body.masterApproval, "backup_restore.restart", "hub_backup", "restore-pending", body.masterApproval?.approvedBy ?? "owner");
    const pendingRestore = input.backupService.getPendingRestore();
    if (!pendingRestore) throw new DomainError("No pending restore is scheduled", 404);
    setTimeout(() => {
      if (input.requestRestart) input.requestRestart();
    }, 250).unref();
    return { restarting: true, pendingRestore };
  });
  app.post("/backups/restore", { preHandler: adminOnly }, async (request) => {
    const body = scheduleRestoreSchema.parse(request.body);
    input.orderService.verifyMasterApprovalForAction(body.masterApproval, "backup_restore.schedule", "hub_backup", body.fileName, body.masterApproval?.approvedBy ?? "owner");
    if (body.confirmationText !== body.fileName) throw new DomainError("Type backup filename to confirm", 400);
    let result: ReturnType<typeof input.backupService.scheduleRestore>;
    try {
      result = input.backupService.scheduleRestore(body.fileName);
    } catch (error) {
      throw backupFailure(error);
    }
    if (body.restartNow) {
      setTimeout(() => {
        if (input.requestRestart) input.requestRestart();
      }, 250).unref();
    }
    return { ...result, restartNow: body.restartNow };
  });
  app.delete<{ Params: { fileName: string } }>("/backups/:fileName", { preHandler: adminOnly }, async (request) => {
    const body = deleteBackupSchema.parse(request.body ?? {});
    input.orderService.verifyMasterApprovalForAction(body.masterApproval, "backup.delete", "hub_backup", request.params.fileName, body.masterApproval?.approvedBy ?? "owner");
    if (body.confirmationText !== request.params.fileName) throw new DomainError("Type backup filename to confirm", 400);
    let result: ReturnType<typeof input.backupService.deleteBackup>;
    try {
      result = input.backupService.deleteBackup(request.params.fileName);
    } catch (error) {
      throw backupFailure(error);
    }
    if (!result.deleted) throw new DomainError("Automatic safety backups cannot be deleted", 400);
    return result;
  });

  app.get("/system/update/status", { preHandler: adminOnly }, async () => requireAppUpdateService().status());
  app.post("/system/update/online/install", { preHandler: adminOnly }, async () => requireAppUpdateService().installOnlineUpdate());
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
