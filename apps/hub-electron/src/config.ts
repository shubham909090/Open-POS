export interface HubConfig {
  host: string;
  port: number;
  databasePath: string;
  printerDryRun: boolean;
  convexHttpUrl?: string;
  posSyncSecret?: string;
}

export function loadHubConfig(env = process.env): HubConfig {
  return {
    host: env.HUB_HOST ?? "0.0.0.0",
    port: Number(env.HUB_PORT ?? 3737),
    databasePath: env.HUB_DATABASE_PATH ?? "./data/hub.sqlite",
    printerDryRun: env.HUB_PRINTER_DRY_RUN !== "false",
    convexHttpUrl: env.CONVEX_HTTP_URL ?? env.CONVEX_URL,
    posSyncSecret: env.POS_SYNC_SECRET
  };
}
