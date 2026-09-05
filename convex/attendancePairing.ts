import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { requireRestaurantAdmin } from "./admin/access";
import {
  createAttendancePairingCode,
  createDeviceToken,
  deviceTokenHash,
  nowIso,
  pairingCodeHash,
  writeAttendanceAudit
} from "./attendanceAccess";

export const pair = mutation({
  args: { code: v.string() },
  returns: v.object({ token: v.string(), expiresAt: v.string() }),
  handler: async (ctx, args) => {
    const codeHash = await pairingCodeHash(args.code);
    const pairingCode = await ctx.db
      .query("attendancePairingCodes")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", codeHash))
      .unique();
    const now = nowIso();
    if (!pairingCode || pairingCode.redeemedAt || pairingCode.revokedAt || pairingCode.expiresAt <= now) {
      throw new Error("Pairing code is invalid, expired, or already used");
    }

    const generated = createDeviceToken(now);
    const tokenHash = await deviceTokenHash(generated.token);
    const credentialId = await ctx.db.insert("attendanceDeviceCredentials", {
      restaurantId: pairingCode.restaurantId,
      tokenHash,
      tokenPrefix: generated.tokenPrefix,
      createdAt: now,
      expiresAt: generated.expiresAt
    });
    await ctx.db.patch(pairingCode._id, { redeemedAt: now });
    await writeAttendanceAudit(ctx, {
      restaurantId: pairingCode.restaurantId,
      deviceCredentialId: credentialId,
      actorType: "device",
      actorIdentifier: String(credentialId),
      action: "device.paired",
      entityType: "attendanceDeviceCredential",
      entityId: String(credentialId),
      details: { pairingCodeId: String(pairingCode._id) }
    });
    return { token: generated.token, expiresAt: generated.expiresAt };
  }
});

export const createPairingCode = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    expiresInMinutes: v.optional(v.number())
  },
  returns: v.object({
    pairingCodeId: v.id("attendancePairingCodes"),
    code: v.string(),
    expiresAt: v.string()
  }),
  handler: async (ctx, args) => {
    const { identity } = await requireRestaurantAdmin(ctx, args.restaurantId);
    const result = await createAttendancePairingCode(ctx, {
      restaurantId: args.restaurantId,
      expiresInMinutes: args.expiresInMinutes,
      createdByType: "admin",
      createdByIdentifier: identity.tokenIdentifier
    });
    await writeAttendanceAudit(ctx, {
      restaurantId: args.restaurantId,
      actorType: "admin",
      actorIdentifier: identity.tokenIdentifier,
      action: "pairing_code.created",
      entityType: "attendancePairingCode",
      entityId: String(result.pairingCodeId),
      details: { expiresAt: result.expiresAt }
    });
    return result;
  }
});

export const revokePairingCode = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    pairingCodeId: v.id("attendancePairingCodes")
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireRestaurantAdmin(ctx, args.restaurantId);
    const pairingCode = await ctx.db.get(args.pairingCodeId);
    if (!pairingCode || pairingCode.restaurantId !== args.restaurantId) {
      throw new Error("Pairing code not found");
    }
    if (!pairingCode.revokedAt && !pairingCode.redeemedAt) {
      await ctx.db.patch(pairingCode._id, { revokedAt: nowIso() });
    }
    await writeAttendanceAudit(ctx, {
      restaurantId: args.restaurantId,
      actorType: "admin",
      actorIdentifier: identity.tokenIdentifier,
      action: "pairing_code.revoked",
      entityType: "attendancePairingCode",
      entityId: String(pairingCode._id)
    });
    return null;
  }
});

export const listDevices = query({
  args: { restaurantId: v.id("restaurants"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(v.object({
      credentialId: v.id("attendanceDeviceCredentials"),
      tokenPrefix: v.string(),
      createdAt: v.string(),
      expiresAt: v.string(),
      revokedAt: v.optional(v.string())
    })),
    isDone: v.boolean(),
    continueCursor: v.string()
  }),
  handler: async (ctx, args) => {
    await requireRestaurantAdmin(ctx, args.restaurantId);
    const result = await ctx.db
      .query("attendanceDeviceCredentials")
      .withIndex("by_restaurantId_and_createdAt", (q) => q.eq("restaurantId", args.restaurantId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      page: result.page.map((row) => ({
        credentialId: row._id,
        tokenPrefix: row.tokenPrefix,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        ...(row.revokedAt ? { revokedAt: row.revokedAt } : {})
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor
    };
  }
});

export const listRecentAudit = query({
  args: { restaurantId: v.id("restaurants") },
  returns: v.array(v.object({
    auditId: v.id("attendanceAuditRecords"),
    actorType: v.union(v.literal("device"), v.literal("admin"), v.literal("internal")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    detailsJson: v.string(),
    occurredAt: v.string()
  })),
  handler: async (ctx, args) => {
    await requireRestaurantAdmin(ctx, args.restaurantId);
    const rows = await ctx.db
      .query("attendanceAuditRecords")
      .withIndex("by_restaurantId_and_occurredAt", (q) => q.eq("restaurantId", args.restaurantId))
      .order("desc")
      .take(200);
    return rows.map((row) => ({
      auditId: row._id,
      actorType: row.actorType,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      detailsJson: row.detailsJson,
      occurredAt: row.occurredAt
    }));
  }
});

export const revokeDevice = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    credentialId: v.id("attendanceDeviceCredentials")
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireRestaurantAdmin(ctx, args.restaurantId);
    const credential = await ctx.db.get(args.credentialId);
    if (!credential || credential.restaurantId !== args.restaurantId) {
      throw new Error("Attendance device not found");
    }
    if (!credential.revokedAt) await ctx.db.patch(credential._id, { revokedAt: nowIso() });
    await writeAttendanceAudit(ctx, {
      restaurantId: args.restaurantId,
      actorType: "admin",
      actorIdentifier: identity.tokenIdentifier,
      action: "device.revoked",
      entityType: "attendanceDeviceCredential",
      entityId: String(credential._id)
    });
    return null;
  }
});
