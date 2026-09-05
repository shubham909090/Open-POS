import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { randomHex } from "./admin/access";
import { sha256Hex } from "./backupModel";

const PAIRING_CODE_PREFIX = "SKY";
const DEVICE_TOKEN_PREFIX = "att_";
const DEFAULT_PAIRING_MINUTES = 10;
const DEVICE_CREDENTIAL_DAYS = 365;

export function nowIso() {
  return new Date().toISOString();
}

export function normalizePairingCode(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function pairingCodeHash(value: string) {
  return sha256Hex(normalizePairingCode(value));
}

export function deviceTokenHash(value: string) {
  return sha256Hex(value.trim());
}

function expiresAtFromMinutes(now: string, minutes: number, maximumMinutes: number) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > maximumMinutes) {
    throw new Error(`Pairing code expiry must be between 1 and ${maximumMinutes} minutes`);
  }
  return new Date(Date.parse(now) + minutes * 60_000).toISOString();
}

function expiresAtFromDays(now: string, days: number) {
  return new Date(Date.parse(now) + days * 86_400_000).toISOString();
}

export async function createAttendancePairingCode(
  ctx: MutationCtx,
  args: {
    restaurantId: Id<"restaurants">;
    expiresInMinutes?: number;
    createdByType: "admin" | "internal";
    createdByIdentifier: string;
  }
) {
  const now = nowIso();
  const entropy = randomHex(16).toUpperCase();
  const groups = entropy.match(/.{1,8}/g) ?? [entropy];
  const code = `${PAIRING_CODE_PREFIX}-${groups.join("-")}`;
  const codeHash = await pairingCodeHash(code);
  const expiresAt = expiresAtFromMinutes(now, args.expiresInMinutes ?? DEFAULT_PAIRING_MINUTES, args.createdByType === "internal" ? 2880 : 60);
  const pairingCodeId = await ctx.db.insert("attendancePairingCodes", {
    restaurantId: args.restaurantId,
    codeHash,
    createdAt: now,
    expiresAt,
    createdByType: args.createdByType,
    createdByIdentifier: args.createdByIdentifier
  });
  return { pairingCodeId, code, expiresAt };
}

export function createDeviceToken(now: string) {
  const token = `${DEVICE_TOKEN_PREFIX}${randomHex(32)}`;
  return {
    token,
    tokenPrefix: token.slice(0, 12),
    expiresAt: expiresAtFromDays(now, DEVICE_CREDENTIAL_DAYS)
  };
}

export async function requireAttendanceDevice(ctx: QueryCtx | MutationCtx, token: string) {
  const normalized = token.trim();
  if (!normalized.startsWith(DEVICE_TOKEN_PREFIX) || normalized.length !== 68) {
    throw new Error("Attendance device credential is invalid or expired");
  }
  const tokenHash = await deviceTokenHash(normalized);
  const credential = await ctx.db
    .query("attendanceDeviceCredentials")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  const now = nowIso();
  if (!credential || credential.revokedAt || credential.expiresAt <= now) {
    throw new Error("Attendance device credential is invalid or expired");
  }
  const restaurant = await ctx.db.get(credential.restaurantId);
  if (!restaurant) throw new Error("Attendance device credential is invalid or expired");
  return { credential, restaurant };
}

export async function writeAttendanceAudit(
  ctx: MutationCtx,
  args: {
    restaurantId: Id<"restaurants">;
    deviceCredentialId?: Id<"attendanceDeviceCredentials">;
    actorType: "device" | "admin" | "internal";
    actorIdentifier: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, unknown>;
  }
) {
  await ctx.db.insert("attendanceAuditRecords", {
    restaurantId: args.restaurantId,
    ...(args.deviceCredentialId ? { deviceCredentialId: args.deviceCredentialId } : {}),
    actorType: args.actorType,
    actorIdentifier: args.actorIdentifier,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    detailsJson: JSON.stringify(args.details ?? {}),
    occurredAt: nowIso()
  });
}
