import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { ConvexSyncBridge } from "../sync/convex-sync.js";
import { createTestHub } from "./helpers.js";

function markLicenseFresh(database: ReturnType<typeof createTestHub>["database"]) {
  database.db
    .prepare(
      `INSERT INTO hub_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run("license_last_online_check_at", new Date().toISOString(), new Date().toISOString());
}

function writeSetting(database: ReturnType<typeof createTestHub>["database"], key: string, value: string) {
  database.db
    .prepare(
      `INSERT INTO hub_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, new Date().toISOString());
}

describe("ConvexSyncBridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips safely when cloud backup is not configured", async () => {
    const { database, orderService } = createTestHub();
    orderService.createFloor({ name: "Garden" });

    const sync = new ConvexSyncBridge(database.orm, undefined, undefined);

    await expect(sync.pushPending()).resolves.toEqual({ pushed: 0, skipped: true });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending'").get()).toEqual({
      count: 0
    });

    database.close();
  });

  it("pushes restorable backup rows instead of raw event rows", async () => {
    const { database, orderService } = createTestHub();
    orderService.createFloor({ name: "Garden" });
    markLicenseFresh(database);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ upserted: 1, skipped: 0 }), { status: 200 }));

    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    const result = await sync.pushPending();
    expect(result.pushed).toBeGreaterThan(0);
    expect(result.skipped).toBe(false);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.convex.site/pos/backup/push",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-pos-installation-id": "install-main",
          "x-pos-sync-secret": "secret"
        })
      })
    );
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string) as { rows: Array<Record<string, unknown>> };
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.rows.some((row) => row.domain === "floors" && String(row.payloadJson).includes("Garden"))).toBe(true);
    expect(body.rows.every((row) => row.eventId === undefined && row.payloadJson !== undefined && row.payloadHash !== undefined)).toBe(true);

    database.close();
  });

  it("pushes pending tombstones before table sweep rows", async () => {
    const { database } = createTestHub();
    markLicenseFresh(database);
    database.db
      .prepare(
        `INSERT INTO cloud_backup_tombstones (domain, local_id, business_date, deleted_at, pushed_at)
         VALUES ('payments', 'pay-old', '2026-05-24', '2026-05-24T10:00:00.000Z', NULL)`
      )
      .run();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ upserted: 1, skipped: 0 }), { status: 200 }));
    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    await expect(sync.pushPending()).resolves.toMatchObject({ skipped: false });
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string) as { rows: Array<Record<string, unknown>> };
    expect(body.rows[0]).toMatchObject({
      domain: "payments",
      localId: "pay-old",
      businessDate: "2026-05-24",
      deletedAt: "2026-05-24T10:00:00.000Z"
    });
    expect(database.db.prepare("SELECT pushed_at FROM cloud_backup_tombstones WHERE local_id = 'pay-old'").get()).toEqual({
      pushed_at: expect.any(String)
    });

    database.close();
  });

  it("uses cloud settings saved in SQLite without rebuilding the backup bridge", async () => {
    const { database, orderService } = createTestHub();
    orderService.updateHubConnectionSettings({
      cloudUrl: "https://db-config.convex.site",
      installationId: "install-from-db",
      syncSecret: "secret-from-db",
      hubPublicUrl: "http://192.168.1.20:3737"
    });
    markLicenseFresh(database);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ upserted: 1, skipped: 0 }), { status: 200 }));

    const sync = new ConvexSyncBridge(database.orm, undefined, undefined);

    const result = await sync.pushPending();
    expect(result.pushed).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://db-config.convex.site/pos/backup/push",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-pos-installation-id": "install-from-db",
          "x-pos-sync-secret": "secret-from-db"
        })
      })
    );

    database.close();
  });

  it("reports backup push failures without writing event failure state", async () => {
    const { database } = createTestHub();
    markLicenseFresh(database);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));

    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    await expect(sync.pushPending()).rejects.toThrow("Cloud backup failed with 500");
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'failed'").get()).toEqual({
      count: 0
    });

    database.close();
  });

  it("does not pull deprecated cloud support commands", async () => {
    const { database } = createTestHub();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ commands: [] }), { status: 200 }));

    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    await expect(sync.pullCloudSnapshot()).resolves.toEqual({ applied: 0, failed: 0, skipped: false, cursor: undefined });
    expect(fetchSpy).not.toHaveBeenCalled();

    database.close();
  });

  it("does not date-filter layout or catalog dependency rows during order-history restore", async () => {
    const { database } = createTestHub();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 })));
    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    await expect(sync.restoreFromCloud({ kind: "order_history", throughBusinessDate: "2026-05-24" })).resolves.toEqual({
      restored: true,
      imported: 0,
      kind: "order_history"
    });

    const requests = fetchSpy.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string) as { domain: string; throughBusinessDate?: string });
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: "floors" }),
        expect.objectContaining({ domain: "restaurant_tables" }),
        expect.objectContaining({ domain: "sale_groups" }),
        expect.objectContaining({ domain: "menu_items" }),
        expect.objectContaining({ domain: "orders", throughBusinessDate: "2026-05-24" })
      ])
    );
    expect(requests.find((request) => request.domain === "floors")?.throughBusinessDate).toBeUndefined();
    expect(requests.find((request) => request.domain === "restaurant_tables")?.throughBusinessDate).toBeUndefined();
    expect(requests.find((request) => request.domain === "menu_items")?.throughBusinessDate).toBeUndefined();

    database.close();
  });

  it("imports restore pages as they arrive instead of waiting for the whole domain", async () => {
    const { database } = createTestHub();
    let saleGroupPage = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const request = JSON.parse((init as RequestInit).body as string) as { domain: string; cursor?: string };
      if (request.domain !== "sale_groups") return new Response(JSON.stringify({ rows: [] }), { status: 200 });
      saleGroupPage += 1;
      if (saleGroupPage === 1) {
        return new Response(
          JSON.stringify({
            cursor: "next-sale-groups",
            rows: [
              {
                domain: "sale_groups",
                localId: "sg-streamed",
                updatedAt: "2026-05-24T10:00:00.000Z",
                payloadJson: JSON.stringify({
                  id: "sg-streamed",
                  name: "Streamed",
                  kind: "food",
                  report_label: "Streamed",
                  ticket_label: "KOT",
                  tax_components_json: "[]",
                  default_production_unit_id: null,
                  active: 1
                }),
                payloadHash: "hash",
                sourceVersion: 1
              }
            ]
          }),
          { status: 200 }
        );
      }
      expect(database.db.prepare("SELECT name FROM sale_groups WHERE id = 'sg-streamed'").get()).toEqual({ name: "Streamed" });
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    await expect(sync.restoreFromCloud({ kind: "menu_catalog" })).resolves.toMatchObject({ restored: true, imported: 1 });
    expect(fetchSpy).toHaveBeenCalled();

    database.close();
  });

  it("requires an explicit dev signing secret before accepting DEV-SHA256 leases", async () => {
    const { database } = createTestHub();
    const previousAllow = process.env.POS_LICENSE_ALLOW_DEV_SIGNATURES;
    const previousSecret = process.env.POS_LICENSE_DEV_SIGNING_SECRET;
    const payloadJson = JSON.stringify({
      status: "active",
      checkedAt: "2026-05-24T00:00:00.000Z",
      licenseValidUntil: "2026-06-24T00:00:00.000Z",
      leaseExpiresAt: "2026-06-24T00:00:00.000Z",
      offlineWarningDays: 25,
      offlineLockDays: 30
    });
    const signature = createHash("sha256").update(`${payloadJson}.test-dev-secret`).digest("hex");
    writeSetting(database, "license_lease_payload_json", payloadJson);
    writeSetting(database, "license_lease_signature", signature);
    writeSetting(database, "license_lease_algorithm", "DEV-SHA256");
    writeSetting(database, "license_last_online_check_at", "2026-05-24T00:00:00.000Z");
    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main");

    try {
      process.env.POS_LICENSE_ALLOW_DEV_SIGNATURES = "1";
      process.env.POS_LICENSE_DEV_SIGNING_SECRET = "test-dev-secret";
      expect(sync.getLicenseState(new Date("2026-05-24T01:00:00.000Z")).status).toBe("active");

      delete process.env.POS_LICENSE_ALLOW_DEV_SIGNATURES;
      expect(sync.getLicenseState(new Date("2026-05-24T01:00:00.000Z"))).toMatchObject({
        status: "locked",
        reason: "invalid_signature"
      });
    } finally {
      if (previousAllow === undefined) delete process.env.POS_LICENSE_ALLOW_DEV_SIGNATURES;
      else process.env.POS_LICENSE_ALLOW_DEV_SIGNATURES = previousAllow;
      if (previousSecret === undefined) delete process.env.POS_LICENSE_DEV_SIGNING_SECRET;
      else process.env.POS_LICENSE_DEV_SIGNING_SECRET = previousSecret;
      database.close();
    }
  });

  it("verifies production leases with the packaged public key option", () => {
    const { database } = createTestHub();
    const previousPublicKey = process.env.POS_LICENSE_PUBLIC_KEY_PEM;
    delete process.env.POS_LICENSE_PUBLIC_KEY_PEM;
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const payloadJson = JSON.stringify({
      status: "active",
      checkedAt: "2026-05-24T00:00:00.000Z",
      licenseValidUntil: "2026-06-24T00:00:00.000Z",
      leaseExpiresAt: "2026-06-24T00:00:00.000Z",
      offlineWarningDays: 25,
      offlineLockDays: 30
    });
    writeSetting(database, "license_lease_payload_json", payloadJson);
    writeSetting(database, "license_lease_signature", sign("RSA-SHA256", Buffer.from(payloadJson), privateKey).toString("base64"));
    writeSetting(database, "license_lease_algorithm", "RSASSA-PKCS1-v1_5-SHA256");
    writeSetting(database, "license_last_online_check_at", "2026-05-24T00:00:00.000Z");
    const sync = new ConvexSyncBridge(database.orm, "https://example.convex.site", "secret", "install-main", undefined, { publicKeyPem });

    try {
      expect(sync.getLicenseState(new Date("2026-05-24T01:00:00.000Z"))).toMatchObject({
        status: "active",
        message: "License is active."
      });
    } finally {
      if (previousPublicKey === undefined) delete process.env.POS_LICENSE_PUBLIC_KEY_PEM;
      else process.env.POS_LICENSE_PUBLIC_KEY_PEM = previousPublicKey;
      database.close();
    }
  });
});
