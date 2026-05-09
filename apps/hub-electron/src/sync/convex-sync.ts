import type { SqliteDatabase } from "../db/database.js";

interface OutboxRow {
  id: number;
  event_id: string;
  type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: string;
  created_at: string;
}

export class ConvexSyncBridge {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly convexUrl: string | undefined,
    private readonly syncSecret: string | undefined
  ) {}

  pendingEvents(limit = 100): OutboxRow[] {
    return this.db
      .prepare(
        `SELECT so.id, so.event_id, el.type, el.aggregate_type, el.aggregate_id, el.payload, el.created_at
         FROM sync_outbox so
         JOIN event_log el ON el.event_id = so.event_id
         WHERE so.status IN ('pending', 'failed') AND so.attempts < 10
         ORDER BY so.created_at ASC
         LIMIT ?`
      )
      .all(limit) as OutboxRow[];
  }

  async pushPending(): Promise<{ pushed: number; skipped: boolean }> {
    const events = this.pendingEvents();
    if (!this.convexUrl || !this.syncSecret || events.length === 0) {
      return { pushed: 0, skipped: true };
    }

    const response = await fetch(`${this.convexUrl}/pos/ingest-events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pos-sync-secret": this.syncSecret
      },
      body: JSON.stringify({
        events: events.map((event) => ({
          eventId: event.event_id,
          type: event.type,
          aggregateType: event.aggregate_type,
          aggregateId: event.aggregate_id,
          payloadJson: event.payload,
          createdAt: event.created_at
        }))
      })
    });

    if (!response.ok) {
      const message = `Convex sync failed with ${response.status}`;
      this.markFailed(events, message);
      throw new Error(message);
    }

    const markSynced = this.db.prepare("UPDATE sync_outbox SET status = 'synced', updated_at = ? WHERE id = ?");
    const now = new Date().toISOString();
    const done = this.db.transaction(() => {
      for (const event of events) markSynced.run(now, event.id);
    });
    done();

    return { pushed: events.length, skipped: false };
  }

  private markFailed(events: OutboxRow[], message: string): void {
    const now = new Date().toISOString();
    const mark = this.db.prepare(
      `UPDATE sync_outbox
       SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ?
       WHERE id = ?`
    );
    const done = this.db.transaction(() => {
      for (const event of events) mark.run(message, now, event.id);
    });
    done();
  }
}
