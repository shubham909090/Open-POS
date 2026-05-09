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
      count: 2
    });

    database.close();
  });

  it("marks events synced after a successful HTTP push", async () => {
    const { database, orderService } = createTestHub();
    orderService.createFloor({ name: "Garden" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ inserted: 2 }), { status: 200 }));

    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret");

    await expect(sync.pushPending()).resolves.toEqual({ pushed: 2, skipped: false });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'synced'").get()).toEqual({
      count: 2
    });

    database.close();
  });

  it("marks pending events failed when HTTP push fails", async () => {
    const { database, orderService } = createTestHub();
    orderService.createFloor({ name: "Garden" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));

    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret");

    await expect(sync.pushPending()).rejects.toThrow("Convex sync failed with 500");
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'failed'").get()).toEqual({
      count: 2
    });

    database.close();
  });

  it("pulls cloud commands and applies local menu changes", async () => {
    const { database } = createTestHub();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          cursor: "2026-05-09T12:00:00.000Z",
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
      skipped: false,
      cursor: "2026-05-09T12:00:00.000Z"
    });
    expect(database.db.prepare("SELECT name FROM menu_items WHERE id = 'item-cloud-chaas'").get()).toEqual({
      name: "Masala Chaas"
    });

    database.close();
  });
});
