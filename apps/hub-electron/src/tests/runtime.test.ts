import { describe, expect, it, vi } from "vitest";
import { createSyncTick } from "../runtime.js";

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
});
