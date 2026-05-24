import type { SqliteDatabase } from "./database.js";

const EVENT_LOG_RETENTION_DAYS = 30;
const PRINT_JOB_RETENTION_DAYS = 30;
const READY_SEEN_RETENTION_DAYS = 7;
const READY_UNREAD_RETENTION_DAYS = 30;
const IDEMPOTENCY_COMPLETED_RETENTION_DAYS = 14;
const IDEMPOTENCY_UNFINISHED_RETENTION_DAYS = 1;
const PAIRING_CODE_RETENTION_DAYS = 7;
const LAST_LOCAL_MAINTENANCE_KEY = "maintenance_local_cleanup_date";

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function cutoffIso(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function readSetting(db: SqliteDatabase, key: string): string | null {
  const row = db.prepare("SELECT value FROM hub_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function writeSetting(db: SqliteDatabase, key: string, value: string, now: Date) {
  db.prepare(
    `INSERT INTO hub_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, now.toISOString());
}

export function cleanupDeprecatedLocalSyncState(db: SqliteDatabase, now = new Date()) {
  const today = isoDate(now);
  if (readSetting(db, LAST_LOCAL_MAINTENANCE_KEY) === today) {
    return {
      skipped: true,
      deletedOutbox: 0,
      deletedCloudCommandFailures: 0,
      deletedEvents: 0,
      deletedPrintJobs: 0,
      deletedReadyNotifications: 0,
      deletedIdempotencyRecords: 0,
      deletedPairingCodes: 0
    };
  }

  const result = db.transaction(() => {
    const outbox = db.prepare("DELETE FROM sync_outbox").run();
    const cloudCommandFailures = db.prepare("DELETE FROM cloud_command_failures").run();
    const events = db.prepare("DELETE FROM event_log WHERE created_at < ?").run(cutoffIso(now, EVENT_LOG_RETENTION_DAYS));
    const printedJobs = db
      .prepare("DELETE FROM print_jobs WHERE status = 'printed' AND created_at < ?")
      .run(cutoffIso(now, PRINT_JOB_RETENTION_DAYS));
    const failedJobs = db
      .prepare("DELETE FROM print_jobs WHERE status = 'failed' AND updated_at < ?")
      .run(cutoffIso(now, PRINT_JOB_RETENTION_DAYS));
    const seenReadyNotifications = db
      .prepare("DELETE FROM ready_notifications WHERE status = 'seen' AND COALESCE(acknowledged_at, created_at) < ?")
      .run(cutoffIso(now, READY_SEEN_RETENTION_DAYS));
    const unreadReadyNotifications = db
      .prepare("DELETE FROM ready_notifications WHERE status = 'unread' AND created_at < ?")
      .run(cutoffIso(now, READY_UNREAD_RETENTION_DAYS));
    const completedIdempotency = db
      .prepare("DELETE FROM idempotency_records WHERE status = 'completed' AND updated_at < ?")
      .run(cutoffIso(now, IDEMPOTENCY_COMPLETED_RETENTION_DAYS));
    const unfinishedIdempotency = db
      .prepare("DELETE FROM idempotency_records WHERE status IN ('failed', 'in_progress') AND updated_at < ?")
      .run(cutoffIso(now, IDEMPOTENCY_UNFINISHED_RETENTION_DAYS));
    const pairingCodes = db
      .prepare("DELETE FROM pairing_codes WHERE (status IN ('used', 'expired') AND COALESCE(used_at, expires_at, created_at) < ?) OR expires_at < ?")
      .run(cutoffIso(now, PAIRING_CODE_RETENTION_DAYS), cutoffIso(now, PAIRING_CODE_RETENTION_DAYS));
    writeSetting(db, LAST_LOCAL_MAINTENANCE_KEY, today, now);
    return {
      skipped: false,
      deletedOutbox: outbox.changes,
      deletedCloudCommandFailures: cloudCommandFailures.changes,
      deletedEvents: events.changes,
      deletedPrintJobs: printedJobs.changes + failedJobs.changes,
      deletedReadyNotifications: seenReadyNotifications.changes + unreadReadyNotifications.changes,
      deletedIdempotencyRecords: completedIdempotency.changes + unfinishedIdempotency.changes,
      deletedPairingCodes: pairingCodes.changes
    };
  })();

  return result;
}
