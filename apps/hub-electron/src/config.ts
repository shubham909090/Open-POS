import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

export interface HubConfig {
  host: string;
  port: number;
  databasePath: string;
  backupDir: string;
  printerOutputModeDefault: "test" | "live";
  convexHttpUrl?: string;
  posSyncSecret?: string;
  installationId?: string;
  adminToken?: string;
  publicUrl?: string;
}

type EnvMap = Record<string, string | undefined>;

function parseEnvFile(path: string): EnvMap {
  const result: EnvMap = {};
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined) continue;
    const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
    result[key] = value;
  }
  return result;
}

function defaultConfigPaths(env: EnvMap): string[] {
  return [
    env.HUB_CONFIG_FILE,
    env.GAURAV_POS_CONFIG,
    env.APPDATA ? join(env.APPDATA, "Gaurav POS Hub", "hub.env") : undefined,
    env.PROGRAMDATA ? join(env.PROGRAMDATA, "Gaurav POS Hub", "hub.env") : undefined,
    join(defaultAppDataRoot(env), "hub.env"),
    join(homedir(), "AppData", "Roaming", "Gaurav POS Hub", "hub.env"),
    resolve(process.cwd(), "hub.env"),
    resolve(process.cwd(), ".env.local")
  ].filter((path): path is string => Boolean(path));
}

function defaultAppDataRoot(env: EnvMap = process.env): string {
  if (platform() === "win32") {
    return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Gaurav POS Hub");
  }
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", "Gaurav POS Hub");
  }
  return join(env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "Gaurav POS Hub");
}

export function loadHubEnvFiles(env: EnvMap = process.env): EnvMap {
  const merged: EnvMap = {};
  for (const path of defaultConfigPaths(env)) {
    if (!existsSync(path)) continue;
    Object.assign(merged, parseEnvFile(path));
  }
  return merged;
}

export function loadHubConfig(env = process.env): HubConfig {
  const fileEnv = loadHubEnvFiles(env);
  const source = { ...fileEnv, ...env };
  return {
    host: source.HUB_HOST ?? "0.0.0.0",
    port: Number(source.HUB_PORT ?? 3737),
    databasePath: source.HUB_DATABASE_PATH ?? join(defaultAppDataRoot(source), "data", "hub.sqlite"),
    backupDir: source.HUB_BACKUP_DIR ?? join(defaultAppDataRoot(source), "data", "backups"),
    printerOutputModeDefault: source.HUB_PRINTER_DRY_RUN === "false" ? "live" : "test",
    convexHttpUrl: source.CONVEX_HTTP_URL ?? source.CONVEX_URL,
    posSyncSecret: source.POS_SYNC_SECRET,
    installationId: source.POS_INSTALLATION_ID,
    adminToken: source.HUB_ADMIN_TOKEN ?? (source.NODE_ENV === "production" ? undefined : "dev-admin-token"),
    publicUrl: source.HUB_PUBLIC_URL
  };
}
