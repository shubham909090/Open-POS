export interface HubConfig {
  host: string;
  port: number;
  databasePath: string;
  backupDir: string;
  printerDryRun: boolean;
  convexHttpUrl?: string;
  posSyncSecret?: string;
  installationId?: string;
  adminToken?: string;
  publicUrl?: string;
}

export function loadHubConfig(env = process.env): HubConfig {
  return {
    host: env.HUB_HOST ?? "0.0.0.0",
    port: Number(env.HUB_PORT ?? 3737),
    databasePath: env.HUB_DATABASE_PATH ?? "./data/hub.sqlite",
    backupDir: env.HUB_BACKUP_DIR ?? "./data/backups",
    printerDryRun: env.HUB_PRINTER_DRY_RUN !== "false",
    convexHttpUrl: env.CONVEX_HTTP_URL ?? env.CONVEX_URL,
    posSyncSecret: env.POS_SYNC_SECRET,
    installationId: env.POS_INSTALLATION_ID,
    adminToken: env.HUB_ADMIN_TOKEN ?? (env.NODE_ENV === "production" ? undefined : "dev-admin-token"),
    publicUrl: env.HUB_PUBLIC_URL
  };
}
