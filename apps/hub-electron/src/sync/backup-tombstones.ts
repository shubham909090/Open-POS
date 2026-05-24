import type { SqliteDatabase } from "../db/database.js";

export function queueCloudBackupTombstone(
  db: SqliteDatabase,
  input: { domain: string; localId: string; deletedAt: string; businessDate?: string | null }
): void {
  db.prepare(
    `INSERT INTO cloud_backup_tombstones (domain, local_id, business_date, deleted_at, pushed_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(domain, local_id) DO UPDATE SET
       business_date = excluded.business_date,
       deleted_at = excluded.deleted_at,
       pushed_at = NULL`
  ).run(input.domain, input.localId, input.businessDate ?? null, input.deletedAt);
}

export function queueCloudBackupTombstones(
  db: SqliteDatabase,
  domain: string,
  localIds: string[],
  deletedAt = new Date().toISOString()
): void {
  for (const localId of localIds) queueCloudBackupTombstone(db, { domain, localId, deletedAt });
}
