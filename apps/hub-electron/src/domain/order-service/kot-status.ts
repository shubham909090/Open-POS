import type { UpdateKotStatusInput } from "@gaurav-pos/shared";
import { eq } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { kots } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";

export type KotStatusContext = {
  orm: HubOrm;
  db: SqliteDatabase;
  createReadyNotification: (kotId: string) => void;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => void;
};

export function updateKotStatus(ctx: KotStatusContext, kotId: string, input: UpdateKotStatusInput): { id: string; status: string } {
  const run = ctx.db.transaction(() => {
    const result = ctx.orm.update(kots).set({ status: input.status }).where(eq(kots.id, kotId)).run();
    if (result.changes === 0) throw new DomainError("KOT not found", 404);
    if (input.status === "ready") ctx.createReadyNotification(kotId);
    ctx.appendEvent("kot.status_changed", "kot", kotId, { kotId, status: input.status });
    return { id: kotId, status: input.status };
  });
  return run();
}
