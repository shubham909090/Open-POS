import { afterEach, describe, expect, it, vi } from "vitest";
import { ConvexSyncBridge } from "../sync/convex-sync.js";
import { createTestHub } from "./helpers.js";

describe("ConvexSyncBridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips safely when cloud sync is not configured", async () => {
    const { database, orderService } = createTestHub();
    orderService.createFloor({ name: "Garden" });

    const sync = new ConvexSyncBridge(database.orm, undefined, undefined);

    await expect(sync.pushPending()).resolves.toEqual({ pushed: 0, skipped: true });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending'").get()).toEqual({
      count: 1
    });

    database.close();
  });

  it("marks events synced after a successful HTTP push", async () => {
    const { database, orderService } = createTestHub();
    orderService.createFloor({ name: "Garden" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ inserted: 1 }), { status: 200 }));

    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    await expect(sync.pushPending()).resolves.toEqual({ pushed: 1, skipped: false });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'synced'").get()).toEqual({
      count: 1
    });

    database.close();
  });

  it("uses cloud settings saved in SQLite without rebuilding the sync bridge", async () => {
    const { database, orderService } = createTestHub();
    orderService.updateHubConnectionSettings({
      cloudUrl: "https://db-config.convex.site",
      installationId: "install-from-db",
      syncSecret: "secret-from-db",
      hubPublicUrl: "http://192.168.1.20:3737"
    });
    orderService.createFloor({ name: "Terrace" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ inserted: 1 }), { status: 200 }));

    const sync = new ConvexSyncBridge(database.orm, undefined, undefined);

    await expect(sync.pushPending()).resolves.toEqual({ pushed: 2, skipped: false });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://db-config.convex.site/pos/ingest-events",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-pos-installation-id": "install-from-db",
          "x-pos-sync-secret": "secret-from-db"
        })
      })
    );

    database.close();
  });

  it("marks pending events failed when HTTP push fails", async () => {
    const { database, orderService } = createTestHub();
    orderService.createFloor({ name: "Garden" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));

    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    await expect(sync.pushPending()).rejects.toThrow("Convex sync failed with 500");
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'failed'").get()).toEqual({
      count: 1
    });

    database.close();
  });

  it("pulls cloud commands and applies local menu changes", async () => {
    const { database } = createTestHub();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          cursor: JSON.stringify({ createdAt: "2026-05-09T12:00:00.000Z", commandId: "cmd-menu-1" }),
          commands: [
            {
              commandId: "cmd-menu-1",
              type: "menu_item.upsert",
              payloadJson: JSON.stringify({
                id: "item-cloud-chaas",
                name: "Masala Chaas",
                pricePaise: 8000,
                productionUnitId: "unit-bar",
                active: true
              }),
              createdAt: "2026-05-09T12:00:00.000Z"
            }
          ]
        }),
        { status: 200 }
      )
    );

    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    await expect(sync.pullCloudSnapshot()).resolves.toEqual({
      applied: 1,
      failed: 0,
      skipped: false,
      cursor: JSON.stringify({ createdAt: "2026-05-09T12:00:00.000Z", commandId: "cmd-menu-1" })
    });
    expect(database.db.prepare("SELECT name FROM menu_items WHERE id = 'item-cloud-chaas'").get()).toEqual({
      name: "Masala Chaas"
    });
    expect(database.db.prepare("SELECT price_paise FROM menu_item_variants WHERE menu_item_id = 'item-cloud-chaas' AND kind = 'default'").get()).toEqual({
      price_paise: 8000
    });

    database.close();
  });

  it("applies cloud device commands by canonical hubDeviceId", async () => {
    const { database } = createTestHub();
    database.db
      .prepare(
        "INSERT INTO local_devices (id, name, role, token_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run("device-captain-1", "Old name", "captain", "hash-captain-1", "active", new Date().toISOString());
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          cursor: JSON.stringify({ createdAt: "2026-05-09T12:00:01.000Z", commandId: "cmd-device-2" }),
          commands: [
            {
              commandId: "cmd-device-1",
              type: "device.updated",
              payloadJson: JSON.stringify({ hubDeviceId: "device-captain-1", name: "Captain A", role: "captain" }),
              createdAt: "2026-05-09T12:00:00.000Z"
            },
            {
              commandId: "cmd-device-2",
              type: "device.revoked",
              payloadJson: JSON.stringify({ hubDeviceId: "device-captain-1" }),
              createdAt: "2026-05-09T12:00:01.000Z"
            }
          ]
        }),
        { status: 200 }
      )
    );

    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    await expect(sync.pullCloudSnapshot()).resolves.toMatchObject({ applied: 2, skipped: false });
    expect(database.db.prepare("SELECT name, role, status FROM local_devices WHERE id = ?").get("device-captain-1")).toEqual({
      name: "Captain A",
      role: "captain",
      status: "revoked"
    });

    database.close();
  });

  it("records bad cloud commands without blocking later commands or cursor advancement", async () => {
    const { database } = createTestHub();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          cursor: JSON.stringify({ createdAt: "2026-05-09T12:00:01.000Z", commandId: "cmd-good" }),
          commands: [
            {
              commandId: "cmd-bad",
              type: "production_unit.upsert",
              payloadJson: JSON.stringify({ id: "unit-bad" }),
              createdAt: "2026-05-09T12:00:00.000Z"
            },
            {
              commandId: "cmd-good",
              type: "menu_item.upsert",
              payloadJson: JSON.stringify({ id: "item-cloud-updated-dal", name: "Cloud Dal", pricePaise: 25_000, productionUnitId: "unit-kitchen", active: true }),
              createdAt: "2026-05-09T12:00:01.000Z"
            }
          ]
        }),
        { status: 200 }
      )
    );

    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    await expect(sync.pullCloudSnapshot()).resolves.toMatchObject({ applied: 1, failed: 1, skipped: false });
    expect(database.db.prepare("SELECT error FROM cloud_command_failures WHERE command_id = 'cmd-bad'").get()).toMatchObject({
      error: "Cloud command missing production unit name"
    });
    expect(database.db.prepare("SELECT name FROM menu_items WHERE id = 'item-cloud-updated-dal'").get()).toEqual({
      name: "Cloud Dal"
    });
    expect(database.db.prepare("SELECT value FROM hub_settings WHERE key = 'cloud_snapshot_cursor'").get()).toEqual({
      value: JSON.stringify({ createdAt: "2026-05-09T12:00:01.000Z", commandId: "cmd-good" })
    });

    database.close();
  });
});
