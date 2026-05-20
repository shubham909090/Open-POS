import { eq } from "drizzle-orm";
import type { HubOrm } from "../../db/database.js";
import { hubSettings } from "../../db/drizzle-schema.js";

export function readSetting(orm: HubOrm, key: string): string | undefined {
  const row = orm.select({ value: hubSettings.value }).from(hubSettings).where(eq(hubSettings.key, key)).get();
  return row?.value;
}

export function writeSetting(orm: HubOrm, key: string, value: string): void {
  const now = new Date().toISOString();
  orm
    .insert(hubSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: hubSettings.key, set: { value, updatedAt: now } })
    .run();
}
