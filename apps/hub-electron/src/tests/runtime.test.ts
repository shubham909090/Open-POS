import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stopThenSpawnReplacement } from "../process-restart.js";
import { createSyncTick, startHub } from "../runtime.js";

const managedEnvKeys = ["HUB_DATABASE_PATH", "HUB_BACKUP_DIR", "HUB_UPDATE_DIR", "HUB_PORT", "HUB_HOST"] as const;
const originalEnv = Object.fromEntries(managedEnvKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of managedEnvKeys) {
    const original = originalEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("runtime sync scheduler", () => {
  it("pushes and pulls on each sync tick", async () => {
    const syncBridge = {
      pushPending: vi.fn().mockResolvedValue({ pushed: 1, skipped: false }),
      pullCloudSnapshot: vi.fn().mockResolvedValue({ applied: 2, failed: 0, skipped: false }),
      isCloudBackupEnabled: vi.fn().mockReturnValue(true)
    };
    const log = { warn: vi.fn() };

    const tick = createSyncTick(syncBridge, log);
    await expect(tick()).resolves.toMatchObject({ skipped: false });

    expect(syncBridge.pushPending).toHaveBeenCalledTimes(1);
    expect(syncBridge.pullCloudSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not pull cloud changes when Cloud Backup is off", async () => {
    const syncBridge = {
      pushPending: vi.fn().mockResolvedValue({ pushed: 0, skipped: true }),
      pullCloudSnapshot: vi.fn().mockResolvedValue({ applied: 2, failed: 0, skipped: false }),
      isCloudBackupEnabled: vi.fn().mockReturnValue(false)
    };
    const log = { warn: vi.fn() };

    const tick = createSyncTick(syncBridge, log);
    await expect(tick()).resolves.toEqual({
      skipped: false,
      pushed: { pushed: 0, skipped: true },
      pulled: { applied: 0, failed: 0, skipped: true }
    });

    expect(syncBridge.pushPending).toHaveBeenCalledTimes(1);
    expect(syncBridge.pullCloudSnapshot).not.toHaveBeenCalled();
  });

  it("does not overlap slow sync ticks", async () => {
    let release!: () => void;
    const pushDone = new Promise<{ pushed: number; skipped: boolean }>((resolve) => {
      release = () => resolve({ pushed: 1, skipped: false });
    });
    const syncBridge = {
      pushPending: vi.fn().mockReturnValue(pushDone),
      pullCloudSnapshot: vi.fn().mockResolvedValue({ applied: 0, failed: 0, skipped: false }),
      isCloudBackupEnabled: vi.fn().mockReturnValue(true)
    };
    const log = { warn: vi.fn() };

    const tick = createSyncTick(syncBridge, log);
    const first = tick();
    await expect(tick()).resolves.toEqual({ skipped: true, reason: "already_running" });
    release();
    await first;

    expect(syncBridge.pushPending).toHaveBeenCalledTimes(1);
    expect(syncBridge.pullCloudSnapshot).toHaveBeenCalledTimes(1);
  });

  it("exposes an idempotent shutdown that closes the server and SQLite handle", async () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-runtime-stop-"));
    process.env.HUB_HOST = "127.0.0.1";
    process.env.HUB_PORT = "0";
    process.env.HUB_DATABASE_PATH = join(root, "hub.sqlite");
    process.env.HUB_BACKUP_DIR = join(root, "backups");
    process.env.HUB_UPDATE_DIR = join(root, "updates");

    const hub = await startHub();

    expect(hub.stop).toEqual(expect.any(Function));
    await hub.stop();
    await hub.stop();
    expect(() => hub.database.db.prepare("SELECT 1").get()).toThrow(/closed|not open/i);

    rmSync(root, { recursive: true, force: true });
  });

  it("stops the hub before spawning a CLI restart replacement", async () => {
    const order: string[] = [];
    const stop = vi.fn(async () => {
      order.push("stop");
    });
    const child = { unref: vi.fn(() => order.push("unref")) };
    const spawnProcess = vi.fn(() => {
      order.push("spawn");
      return child;
    });
    const exitProcess = vi.fn(() => {
      order.push("exit");
    });

    await stopThenSpawnReplacement({
      stop,
      execPath: "/usr/local/bin/node",
      args: ["main.js"],
      cwd: "/tmp/gaurav",
      env: { HUB_PORT: "3737" },
      spawnProcess: spawnProcess as never,
      exitProcess
    });

    expect(spawnProcess).toHaveBeenCalledWith("/usr/local/bin/node", ["main.js"], {
      cwd: "/tmp/gaurav",
      detached: true,
      env: { HUB_PORT: "3737" },
      stdio: "inherit"
    });
    expect(order).toEqual(["stop", "spawn", "unref", "exit"]);
  });

  it("does not spawn a CLI restart replacement when shutdown fails", async () => {
    const spawnProcess = vi.fn();
    const exitProcess = vi.fn();

    await expect(stopThenSpawnReplacement({
      stop: vi.fn(async () => {
        throw new Error("database still closing");
      }),
      execPath: "/usr/local/bin/node",
      args: ["main.js"],
      cwd: "/tmp/gaurav",
      env: {},
      spawnProcess: spawnProcess as never,
      exitProcess
    })).rejects.toThrow("database still closing");

    expect(spawnProcess).not.toHaveBeenCalled();
    expect(exitProcess).not.toHaveBeenCalled();
  });
});
