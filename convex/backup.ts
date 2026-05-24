import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { backupBatchRowValidator, backupDomainValidator, backupRestorePageValidator } from "./backupModel";

type BackupRowDoc = Doc<"backupRows">;

const MAX_BACKUP_BATCH = 100;
const MAX_RESTORE_PAGE = 100;
const MAX_PAYLOAD_BYTES = 700_000;

const backupManifestRowValidator = v.object({
  domain: backupDomainValidator,
  lastBatchRowCount: v.number(),
  lastBusinessDate: v.optional(v.string()),
  lastUpdatedAt: v.optional(v.string()),
  lastReceivedAt: v.string()
});

function nowIso() {
  return new Date().toISOString();
}

function encodeCursor(value: Record<string, string>) {
  return btoa(JSON.stringify(value));
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(atob(cursor)) as Record<string, unknown>;
    const first = typeof parsed.first === "string" ? parsed.first : "";
    const localId = typeof parsed.localId === "string" ? parsed.localId : "";
    if (!first || !localId) return null;
    return { first, localId };
  } catch {
    return null;
  }
}

function restoreRow(row: BackupRowDoc) {
  return {
    domain: row.domain,
    localId: row.localId,
    ...(row.businessDate ? { businessDate: row.businessDate } : {}),
    ...(row.localUpdatedAt ? { localUpdatedAt: row.localUpdatedAt } : {}),
    payloadJson: row.payloadJson,
    payloadHash: row.payloadHash,
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    sourceVersion: row.sourceVersion,
    updatedAt: row.updatedAt
  };
}

function nextUpdatedCursor(row: BackupRowDoc) {
  return encodeCursor({ first: row.updatedAt, localId: row.localId });
}

function nextBusinessDateCursor(row: BackupRowDoc) {
  return encodeCursor({ first: row.businessDate ?? "", localId: row.localId });
}

async function authenticateActivation(
  ctx: MutationCtx,
  installationId: string,
  syncSecret: string
) {
  const activation = await ctx.db
    .query("licenseActivations")
    .withIndex("by_installation_id", (q) => q.eq("installationId", installationId))
    .unique();
  if (!activation || activation.syncSecret !== syncSecret || activation.status !== "active") {
    throw new Error("Unauthorized installation");
  }
  if (activation.licenseValidUntil <= nowIso()) throw new Error("License expired");
  return activation;
}

async function touchInstallation(ctx: MutationCtx, installationId: string, seenAt: string) {
  const installation = await ctx.db
    .query("installations")
    .withIndex("by_installation_id", (q) => q.eq("installationId", installationId))
    .unique();
  if (installation) await ctx.db.patch(installation._id, { lastSeenAt: seenAt });
}

export const pushBackupBatch = internalMutation({
  args: {
    installationId: v.string(),
    syncSecret: v.string(),
    rows: v.array(backupBatchRowValidator)
  },
  returns: v.object({ upserted: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    if (args.rows.length > MAX_BACKUP_BATCH) throw new Error("Too many backup rows in one batch");
    const activation = await authenticateActivation(ctx, args.installationId, args.syncSecret);
    const receivedAt = nowIso();
    await ctx.db.patch(activation._id, { lastSeenAt: receivedAt });
    await touchInstallation(ctx, args.installationId, receivedAt);

    let upserted = 0;
    let skipped = 0;
    const manifestUpdates = new Map<
      Doc<"backupRows">["domain"],
      { count: number; lastBusinessDate?: string; lastUpdatedAt?: string }
    >();

    for (const row of args.rows) {
      if (new TextEncoder().encode(row.payloadJson).length > MAX_PAYLOAD_BYTES) {
        throw new Error(`Backup row ${row.domain}/${row.localId} is too large`);
      }
      const existing = await ctx.db
        .query("backupRows")
        .withIndex("by_restaurant_domain_localId", (q) =>
          q.eq("restaurantId", activation.restaurantId).eq("domain", row.domain).eq("localId", row.localId)
        )
        .unique();
      const updatedAt = row.localUpdatedAt ?? receivedAt;
      const next = {
        restaurantId: activation.restaurantId,
        activationId: activation._id,
        domain: row.domain,
        localId: row.localId,
        ...(row.businessDate ? { businessDate: row.businessDate } : {}),
        ...(row.localUpdatedAt ? { localUpdatedAt: row.localUpdatedAt } : {}),
        payloadJson: row.payloadJson,
        payloadHash: row.payloadHash,
        ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
        sourceVersion: row.sourceVersion,
        updatedAt,
        receivedAt
      };

      if (existing && existing.payloadHash === row.payloadHash && existing.deletedAt === row.deletedAt) {
        skipped += 1;
      } else if (existing) {
        await ctx.db.patch(existing._id, next);
        upserted += 1;
      } else {
        await ctx.db.insert("backupRows", next);
        upserted += 1;
      }

      const manifest = manifestUpdates.get(row.domain) ?? { count: 0 };
      manifest.count += 1;
      if (row.businessDate && (!manifest.lastBusinessDate || row.businessDate > manifest.lastBusinessDate)) {
        manifest.lastBusinessDate = row.businessDate;
      }
      if (!manifest.lastUpdatedAt || updatedAt > manifest.lastUpdatedAt) manifest.lastUpdatedAt = updatedAt;
      manifestUpdates.set(row.domain, manifest);
    }

    for (const [domain, manifest] of manifestUpdates) {
      const existing = await ctx.db
        .query("backupManifests")
        .withIndex("by_restaurant_and_domain", (q) => q.eq("restaurantId", activation.restaurantId).eq("domain", domain))
        .unique();
      const body = {
        restaurantId: activation.restaurantId,
        domain,
        lastBatchRowCount: manifest.count,
        ...(manifest.lastBusinessDate ? { lastBusinessDate: manifest.lastBusinessDate } : {}),
        ...(manifest.lastUpdatedAt ? { lastUpdatedAt: manifest.lastUpdatedAt } : {}),
        lastReceivedAt: receivedAt
      };
      if (existing) await ctx.db.patch(existing._id, body);
      else await ctx.db.insert("backupManifests", body);
    }

    return { upserted, skipped };
  }
});

export const manifest = internalMutation({
  args: {
    installationId: v.string(),
    syncSecret: v.string()
  },
  returns: v.object({
    restaurantId: v.id("restaurants"),
    manifests: v.array(backupManifestRowValidator)
  }),
  handler: async (ctx, args) => {
    const activation = await authenticateActivation(ctx, args.installationId, args.syncSecret);
    const seenAt = nowIso();
    await ctx.db.patch(activation._id, { lastSeenAt: seenAt });
    await touchInstallation(ctx, args.installationId, seenAt);
    const rows = await ctx.db
      .query("backupManifests")
      .withIndex("by_restaurant_and_receivedAt", (q) => q.eq("restaurantId", activation.restaurantId))
      .order("desc")
      .take(100);
    return {
      restaurantId: activation.restaurantId,
      manifests: rows.map((row) => ({
        domain: row.domain,
        lastBatchRowCount: row.lastBatchRowCount,
        ...(row.lastBusinessDate ? { lastBusinessDate: row.lastBusinessDate } : {}),
        ...(row.lastUpdatedAt ? { lastUpdatedAt: row.lastUpdatedAt } : {}),
        lastReceivedAt: row.lastReceivedAt
      }))
    };
  }
});

async function rowsByBusinessDate(
  ctx: MutationCtx,
  restaurantId: Doc<"licenseActivations">["restaurantId"],
  domain: Doc<"backupRows">["domain"],
  throughBusinessDate: string,
  cursor: ReturnType<typeof decodeCursor>,
  limit: number
) {
  if (!cursor) {
    return ctx.db
      .query("backupRows")
      .withIndex("by_restaurant_domain_businessDate_localId", (q) =>
        q.eq("restaurantId", restaurantId).eq("domain", domain).lte("businessDate", throughBusinessDate)
      )
      .order("asc")
      .take(limit);
  }

  const sameDate = await ctx.db
    .query("backupRows")
    .withIndex("by_restaurant_domain_businessDate_localId", (q) =>
      q.eq("restaurantId", restaurantId).eq("domain", domain).eq("businessDate", cursor.first).gt("localId", cursor.localId)
    )
    .order("asc")
    .take(limit);
  if (sameDate.length >= limit) return sameDate;

  const laterDates = await ctx.db
    .query("backupRows")
    .withIndex("by_restaurant_domain_businessDate_localId", (q) =>
      q.eq("restaurantId", restaurantId).eq("domain", domain).gt("businessDate", cursor.first).lte("businessDate", throughBusinessDate)
    )
    .order("asc")
    .take(limit - sameDate.length);
  return [...sameDate, ...laterDates];
}

async function rowsByUpdatedAt(
  ctx: MutationCtx,
  restaurantId: Doc<"licenseActivations">["restaurantId"],
  domain: Doc<"backupRows">["domain"],
  cursor: ReturnType<typeof decodeCursor>,
  limit: number
) {
  if (!cursor) {
    return ctx.db
      .query("backupRows")
      .withIndex("by_restaurant_domain_updatedAt_localId", (q) => q.eq("restaurantId", restaurantId).eq("domain", domain))
      .order("asc")
      .take(limit);
  }

  const sameUpdatedAt = await ctx.db
    .query("backupRows")
    .withIndex("by_restaurant_domain_updatedAt_localId", (q) =>
      q.eq("restaurantId", restaurantId).eq("domain", domain).eq("updatedAt", cursor.first).gt("localId", cursor.localId)
    )
    .order("asc")
    .take(limit);
  if (sameUpdatedAt.length >= limit) return sameUpdatedAt;

  const laterUpdatedAt = await ctx.db
    .query("backupRows")
    .withIndex("by_restaurant_domain_updatedAt_localId", (q) =>
      q.eq("restaurantId", restaurantId).eq("domain", domain).gt("updatedAt", cursor.first)
    )
    .order("asc")
    .take(limit - sameUpdatedAt.length);
  return [...sameUpdatedAt, ...laterUpdatedAt];
}

export const pullRestorePage = internalMutation({
  args: {
    installationId: v.string(),
    syncSecret: v.string(),
    domain: backupDomainValidator,
    throughBusinessDate: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number())
  },
  returns: backupRestorePageValidator,
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(MAX_RESTORE_PAGE, Math.floor(args.limit ?? MAX_RESTORE_PAGE)));
    const activation = await authenticateActivation(ctx, args.installationId, args.syncSecret);
    const seenAt = nowIso();
    await ctx.db.patch(activation._id, { lastSeenAt: seenAt });
    await touchInstallation(ctx, args.installationId, seenAt);
    const cursor = decodeCursor(args.cursor);
    const rows = args.throughBusinessDate
      ? await rowsByBusinessDate(ctx, activation.restaurantId, args.domain, args.throughBusinessDate, cursor, limit)
      : await rowsByUpdatedAt(ctx, activation.restaurantId, args.domain, cursor, limit);
    const last = rows.at(-1);
    return {
      ...(last
        ? {
            cursor: args.throughBusinessDate ? nextBusinessDateCursor(last) : nextUpdatedCursor(last)
          }
        : {}),
      rows: rows.map(restoreRow)
    };
  }
});
