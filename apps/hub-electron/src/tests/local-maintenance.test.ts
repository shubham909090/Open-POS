import { afterEach, describe, expect, it } from "vitest";
import { HubDatabase } from "../db/database.js";
import { cleanupDeprecatedLocalSyncState } from "../db/local-maintenance.js";

describe("local maintenance", () => {
  const databases: HubDatabase[] = [];

  afterEach(() => {
    while (databases.length > 0) databases.pop()?.db.close();
  });

  function createDatabase() {
    const database = new HubDatabase(":memory:");
    database.migrate();
    databases.push(database);
    return database;
  }

  function insertEvent(database: HubDatabase, eventId: string, createdAt: string) {
    database.db
      .prepare("INSERT INTO event_log (event_id, type, aggregate_type, aggregate_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(eventId, "test.event", "test", eventId, "{}", createdAt);
    database.db
      .prepare("INSERT INTO sync_outbox (event_id, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(eventId, "pending", 0, createdAt, createdAt);
  }

  function insertPrintJob(database: HubDatabase, id: string, status: string, createdAt: string, updatedAt = createdAt) {
    database.db
      .prepare(
        `INSERT INTO print_jobs (id, target_type, target_id, status, attempts, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, "BILL", id, status, 0, "payload", createdAt, updatedAt);
  }

  function insertReadyNotification(database: HubDatabase, id: string, status: string, createdAt: string, acknowledgedAt: string | null) {
    database.seedDemoData();
    database.db
      .prepare(
        `INSERT OR IGNORE INTO pos_days (id, outlet_id, business_date, status, period_start_at, period_end_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run("pos-day-test", "main", "2026-05-24", "open", createdAt, createdAt, createdAt);
    database.db
      .prepare(
        `INSERT OR IGNORE INTO orders
           (id, table_id, pos_day_id, order_type, status, pax, captain_id, captain_device_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("order-ready-test", "table-t1", "pos-day-test", "dine_in", "open", 2, "captain-1", "device-1", createdAt, createdAt);
    database.db
      .prepare(
        `INSERT OR IGNORE INTO kots (id, order_id, production_unit_id, type, status, sequence, ticket_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("kot-ready-test", "order-ready-test", "unit-kitchen", "new", "ready", 1, "KOT", createdAt);
    database.db
      .prepare(
        `INSERT INTO ready_notifications
           (id, kot_id, order_id, table_id, table_name, production_unit_id, production_unit_name, captain_device_id, captain_id, items_json, status, created_at, acknowledged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        "kot-ready-test",
        "order-ready-test",
        "table-t1",
        "T1",
        "unit-kitchen",
        "Kitchen",
        "device-1",
        "captain-1",
        "[]",
        status,
        createdAt,
        acknowledgedAt
      );
  }

  it("keeps thirty days of local events and clears deprecated cloud event outbox", () => {
    const database = createDatabase();
    insertEvent(database, "old-event", "2026-04-01T00:00:00.000Z");
    insertEvent(database, "recent-event", "2026-05-10T00:00:00.000Z");

    const result = cleanupDeprecatedLocalSyncState(database.db, new Date("2026-05-24T12:00:00.000Z"));

    expect(result).toMatchObject({ skipped: false, deletedOutbox: 2, deletedCloudCommandFailures: 0, deletedEvents: 1 });
    expect(database.db.prepare("SELECT event_id FROM event_log ORDER BY event_id").all()).toEqual([{ event_id: "recent-event" }]);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get()).toEqual({ count: 0 });
  });

  it("prunes short-lived scratch tables without touching active rows", () => {
    const database = createDatabase();
    insertPrintJob(database, "printed-old", "printed", "2026-04-01T00:00:00.000Z");
    insertPrintJob(database, "printed-recent", "printed", "2026-05-20T00:00:00.000Z");
    insertPrintJob(database, "failed-old", "failed", "2026-04-01T00:00:00.000Z", "2026-04-20T00:00:00.000Z");
    insertPrintJob(database, "pending-old", "pending", "2026-04-01T00:00:00.000Z");
    insertReadyNotification(database, "ready-seen-old", "seen", "2026-04-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z");
    insertReadyNotification(database, "ready-unread-old", "unread", "2026-04-01T00:00:00.000Z", null);
    insertReadyNotification(database, "ready-seen-recent", "seen", "2026-05-23T00:00:00.000Z", "2026-05-23T00:00:00.000Z");
    database.db
      .prepare(
        "INSERT INTO idempotency_records (key, route, request_hash, status, response_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run("completed-old", "/orders", "hash", "completed", "{}", "2026-04-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z");
    database.db
      .prepare(
        "INSERT INTO idempotency_records (key, route, request_hash, status, response_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run("progress-old", "/orders", "hash", "in_progress", "", "2026-05-01T00:00:00.000Z", "2026-05-22T00:00:00.000Z");
    database.db
      .prepare(
        "INSERT INTO idempotency_records (key, route, request_hash, status, response_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run("completed-recent", "/orders", "hash", "completed", "{}", "2026-05-20T00:00:00.000Z", "2026-05-20T00:00:00.000Z");
    database.db
      .prepare(
        "INSERT INTO pairing_codes (id, code_hash, device_name, role, status, expires_at, created_at, used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run("pair-used-old", "hash-used-old", "Phone", "captain", "used", "2026-04-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z");
    database.db
      .prepare("INSERT INTO pairing_codes (id, code_hash, device_name, role, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("pair-expired-old", "hash-expired-old", "Phone", "captain", "pending", "2026-05-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z");
    database.db
      .prepare("INSERT INTO pairing_codes (id, code_hash, device_name, role, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("pair-pending-recent", "hash-pending-recent", "Phone", "captain", "pending", "2026-05-23T00:00:00.000Z", "2026-05-23T00:00:00.000Z");
    database.db
      .prepare("INSERT INTO cloud_command_failures (command_id, type, payload_json, error, failed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("cmd-old", "old", "{}", "deprecated", "2026-04-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z");

    const result = cleanupDeprecatedLocalSyncState(database.db, new Date("2026-05-24T12:00:00.000Z"));

    expect(result).toMatchObject({
      skipped: false,
      deletedCloudCommandFailures: 1,
      deletedPrintJobs: 2,
      deletedReadyNotifications: 2,
      deletedIdempotencyRecords: 2,
      deletedPairingCodes: 2
    });
    expect(database.db.prepare("SELECT id FROM print_jobs ORDER BY id").all()).toEqual([{ id: "pending-old" }, { id: "printed-recent" }]);
    expect(database.db.prepare("SELECT id FROM ready_notifications ORDER BY id").all()).toEqual([{ id: "ready-seen-recent" }]);
    expect(database.db.prepare("SELECT key FROM idempotency_records ORDER BY key").all()).toEqual([{ key: "completed-recent" }]);
    expect(database.db.prepare("SELECT id FROM pairing_codes ORDER BY id").all()).toEqual([{ id: "pair-pending-recent" }]);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM cloud_command_failures").get()).toEqual({ count: 0 });
  });

  it("runs at most once per calendar day", () => {
    const database = createDatabase();
    insertEvent(database, "old-event", "2026-04-01T00:00:00.000Z");

    cleanupDeprecatedLocalSyncState(database.db, new Date("2026-05-24T09:00:00.000Z"));
    const result = cleanupDeprecatedLocalSyncState(database.db, new Date("2026-05-24T18:00:00.000Z"));

    expect(result).toMatchObject({ skipped: true, deletedOutbox: 0, deletedEvents: 0 });
  });
});
