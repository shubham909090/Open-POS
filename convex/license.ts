import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  activationStatusValidator,
  addDaysUtc,
  addMonthsUtc,
  leaseStatusValidator,
  normalizeSetupKey,
  sha256Hex
} from "./backupModel";
import { randomHex, requirePlatformAdmin } from "./admin/access";

const OFFLINE_WARNING_DAYS = 25;
const OFFLINE_LOCK_DAYS = 30;
const LEASE_DAYS = 35;

const signedLeaseValidator = v.object({
  payloadJson: v.string(),
  signature: v.string(),
  algorithm: v.string(),
  keyId: v.string()
});

const activationLeaseValidator = v.object({
  restaurantId: v.id("restaurants"),
  installationId: v.string(),
  syncSecret: v.string(),
  lease: signedLeaseValidator,
  checkedAt: v.string(),
  licenseValidUntil: v.string(),
  leaseExpiresAt: v.string(),
  status: leaseStatusValidator,
  offlineWarningDays: v.number(),
  offlineLockDays: v.number()
});

const commandCenterRestaurantValidator = v.object({
  restaurantId: v.id("restaurants"),
  name: v.string(),
  timezone: v.string(),
  createdAt: v.string(),
  licenseValidUntil: v.optional(v.string()),
  licenseStatus: v.optional(v.string()),
  activationStatus: v.optional(v.string()),
  activationId: v.optional(v.id("licenseActivations")),
  installationId: v.optional(v.string()),
  lastSeenAt: v.optional(v.string()),
  lastLicenseCheckAt: v.optional(v.string()),
  setupKeySuffix: v.optional(v.string()),
  backupDomains: v.number(),
  lastBackupAt: v.optional(v.string())
});

function env(name: string) {
  return process.env[name] ?? "";
}

function nowIso() {
  return new Date().toISOString();
}

function safeMonths(months: number) {
  if (!Number.isInteger(months) || months < 1 || months > 6000) {
    throw new Error("License months must be between 1 and 6000");
  }
  return months;
}

function setupKeyPreview(setupKey: string) {
  return {
    keyPrefix: setupKey.slice(0, 7),
    keySuffix: setupKey.slice(-6)
  };
}

function generateSetupKey() {
  return `GAV-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}`.toUpperCase();
}

function minIso(left: string, right: string) {
  return left <= right ? left : right;
}

function pemToArrayBuffer(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n");
  const base64 = normalized
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function toBase64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function signLeasePayload(payloadJson: string) {
  const privateKeyPem = env("POS_LICENSE_PRIVATE_KEY_PEM");
  const keyId = env("POS_LICENSE_KEY_ID") || "default";
  if (privateKeyPem) {
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(privateKeyPem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(payloadJson));
    return {
      payloadJson,
      signature: toBase64(signature),
      algorithm: "RSASSA-PKCS1-v1_5-SHA256",
      keyId
    };
  }

  if (env("POS_LICENSE_ALLOW_DEV_SIGNATURES") !== "1") {
    throw new Error("POS_LICENSE_PRIVATE_KEY_PEM must be configured before issuing licenses");
  }
  const devSecret = env("POS_LICENSE_DEV_SIGNING_SECRET");
  if (!devSecret) throw new Error("POS_LICENSE_DEV_SIGNING_SECRET is required when dev license signatures are enabled");
  return {
    payloadJson,
    signature: await sha256Hex(`${payloadJson}.${devSecret}`),
    algorithm: "DEV-SHA256",
    keyId: "dev"
  };
}

async function createLease(
  restaurant: Doc<"restaurants">,
  activation: Doc<"licenseActivations">,
  checkedAt: string,
  status: "active" | "warning" | "expired" | "suspended" | "revoked"
) {
  const leaseExpiresAt = status === "active" || status === "warning" ? minIso(addDaysUtc(checkedAt, LEASE_DAYS), activation.licenseValidUntil) : checkedAt;
  const payloadJson = JSON.stringify({
    version: 1,
    restaurantId: activation.restaurantId,
    restaurantName: restaurant.name,
    timezone: restaurant.timezone,
    installationId: activation.installationId,
    hubFingerprint: activation.hubFingerprint,
    checkedAt,
    licenseValidUntil: activation.licenseValidUntil,
    leaseExpiresAt,
    status,
    offlineWarningDays: OFFLINE_WARNING_DAYS,
    offlineLockDays: OFFLINE_LOCK_DAYS
  });

  return {
    restaurantId: activation.restaurantId,
    installationId: activation.installationId,
    syncSecret: activation.syncSecret,
    lease: await signLeasePayload(payloadJson),
    checkedAt,
    licenseValidUntil: activation.licenseValidUntil,
    leaseExpiresAt,
    status,
    offlineWarningDays: OFFLINE_WARNING_DAYS,
    offlineLockDays: OFFLINE_LOCK_DAYS
  };
}

async function activeActivationForRestaurant(ctx: QueryCtx | MutationCtx, restaurantId: Id<"restaurants">) {
  return (
    await ctx.db
      .query("licenseActivations")
      .withIndex("by_restaurant_and_status", (q) => q.eq("restaurantId", restaurantId).eq("status", "active"))
      .take(1)
  )[0];
}

export function selectCommandCenterActivation<T extends { status: string; activatedAt?: string; _creationTime?: number }>(activations: T[]) {
  const rank = (status: string) => {
    if (status === "active") return 0;
    if (status === "suspended") return 1;
    if (status === "reset") return 2;
    if (status === "revoked") return 4;
    return 3;
  };
  return [...activations]
    .sort((left, right) => {
      const statusRank = rank(left.status) - rank(right.status);
      if (statusRank !== 0) return statusRank;
      const leftTime = left.activatedAt ?? String(left._creationTime ?? 0);
      const rightTime = right.activatedAt ?? String(right._creationTime ?? 0);
      return rightTime.localeCompare(leftTime);
    })
    .find((activation) => activation.status !== "revoked");
}

async function createSetupKeyForRestaurant(
  ctx: MutationCtx,
  restaurantId: Id<"restaurants">,
  createdByUserTokenIdentifier: string,
  months: number,
  label?: string
) {
  const safe = safeMonths(months);
  const now = nowIso();
  const setupKey = generateSetupKey();
  const normalized = normalizeSetupKey(setupKey);
  const keyHash = await sha256Hex(normalized);
  const preview = setupKeyPreview(normalized);
  const licenseKeyId = await ctx.db.insert("licenseKeys", {
    restaurantId,
    keyHash,
    ...preview,
    label: label?.trim() || "Main hub",
    months: safe,
    validFrom: now,
    validUntil: addMonthsUtc(now, safe),
    status: "active",
    createdAt: now,
    createdByUserTokenIdentifier
  });
  return { setupKey: normalized, licenseKeyId };
}

export const listCommandCenter = query({
  args: {},
  returns: v.array(commandCenterRestaurantValidator),
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const restaurants = await ctx.db.query("restaurants").withIndex("by_createdAt").order("desc").take(100);
    const rows = [];

    for (const restaurant of restaurants) {
      const activations = await ctx.db
        .query("licenseActivations")
        .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
        .take(100);
      const activation = selectCommandCenterActivation(activations);
      const keys = await ctx.db
        .query("licenseKeys")
        .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
        .take(100);
      const manifests = await ctx.db
        .query("backupManifests")
        .withIndex("by_restaurant_and_receivedAt", (q) => q.eq("restaurantId", restaurant._id))
        .order("desc")
        .take(100);
      const latestKey = keys.sort((left, right) => right.validUntil.localeCompare(left.validUntil))[0];
      rows.push({
        restaurantId: restaurant._id,
        name: restaurant.name,
        timezone: restaurant.timezone,
        createdAt: restaurant.createdAt,
        ...(latestKey
          ? {
              licenseValidUntil: latestKey.validUntil,
              licenseStatus: latestKey.status,
              setupKeySuffix: latestKey.keySuffix
            }
          : {}),
        ...(activation
          ? {
              activationId: activation._id,
              activationStatus: activation.status,
              installationId: activation.installationId,
              lastSeenAt: activation.lastSeenAt,
              lastLicenseCheckAt: activation.lastLicenseCheckAt
            }
          : {}),
        backupDomains: manifests.length,
        ...(manifests[0]?.lastReceivedAt ? { lastBackupAt: manifests[0].lastReceivedAt } : {})
      });
    }

    return rows;
  }
});

export const createRestaurantLicense = mutation({
  args: {
    name: v.string(),
    timezone: v.string(),
    months: v.number(),
    label: v.optional(v.string())
  },
  returns: v.object({
    restaurantId: v.id("restaurants"),
    licenseKeyId: v.id("licenseKeys"),
    setupKey: v.string(),
    validUntil: v.string()
  }),
  handler: async (ctx, args) => {
    const { identity } = await requirePlatformAdmin(ctx);
    const name = args.name.trim();
    const timezone = args.timezone.trim();
    if (!name) throw new Error("Restaurant name is required");
    if (!timezone) throw new Error("Timezone is required");
    const restaurantId = await ctx.db.insert("restaurants", {
      name,
      timezone,
      createdAt: nowIso()
    });
    const result = await createSetupKeyForRestaurant(ctx, restaurantId, identity.tokenIdentifier, args.months, args.label);
    const licenseKey = await ctx.db.get(result.licenseKeyId);
    if (!licenseKey) throw new Error("License key creation failed");
    return {
      restaurantId,
      licenseKeyId: result.licenseKeyId,
      setupKey: result.setupKey,
      validUntil: licenseKey.validUntil
    };
  }
});

export const createSetupKey = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    months: v.number(),
    label: v.optional(v.string())
  },
  returns: v.object({
    licenseKeyId: v.id("licenseKeys"),
    setupKey: v.string(),
    validUntil: v.string()
  }),
  handler: async (ctx, args) => {
    const { identity } = await requirePlatformAdmin(ctx);
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");
    const activation = await activeActivationForRestaurant(ctx, args.restaurantId);
    if (activation) throw new Error("Reset the active hub before issuing a replacement setup key");
    const result = await createSetupKeyForRestaurant(ctx, args.restaurantId, identity.tokenIdentifier, args.months, args.label);
    const licenseKey = await ctx.db.get(result.licenseKeyId);
    if (!licenseKey) throw new Error("License key creation failed");
    return {
      licenseKeyId: result.licenseKeyId,
      setupKey: result.setupKey,
      validUntil: licenseKey.validUntil
    };
  }
});

export const renewLicense = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    months: v.number()
  },
  returns: v.object({ validUntil: v.string(), updatedKeys: v.number(), updatedActivations: v.number() }),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const months = safeMonths(args.months);
    const now = nowIso();
    const keys = await ctx.db
      .query("licenseKeys")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .take(100);
    if (keys.length === 0) throw new Error("Restaurant has no license keys");
    const base = keys.reduce((max, key) => (key.validUntil > max ? key.validUntil : max), now);
    const validUntil = addMonthsUtc(base > now ? base : now, months);
    let updatedKeys = 0;
    for (const key of keys) {
      if (key.status === "revoked") continue;
      await ctx.db.patch(key._id, {
        validUntil,
        status: key.status === "expired" ? "redeemed" : key.status
      });
      updatedKeys += 1;
    }

    const activations = await ctx.db
      .query("licenseActivations")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .take(100);
    let updatedActivations = 0;
    for (const activation of activations) {
      if (activation.status === "revoked") continue;
      await ctx.db.patch(activation._id, {
        licenseValidUntil: validUntil,
        leaseExpiresAt: minIso(addDaysUtc(now, LEASE_DAYS), validUntil)
      });
      updatedActivations += 1;
    }

    return { validUntil, updatedKeys, updatedActivations };
  }
});

export const setActivationStatus = mutation({
  args: {
    activationId: v.id("licenseActivations"),
    status: activationStatusValidator
  },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const activation = await ctx.db.get(args.activationId);
    if (!activation) throw new Error("Activation not found");
    const now = nowIso();
    if (args.status === "active") {
      const active = await activeActivationForRestaurant(ctx, activation.restaurantId);
      if (active && active._id !== activation._id) {
        throw new Error("This restaurant already has another active hub. Reset it before reactivating this activation.");
      }
    }
    await ctx.db.patch(activation._id, {
      status: args.status,
      ...(args.status === "suspended" ? { suspendedAt: now } : {}),
      ...(args.status === "reset" ? { resetAt: now } : {}),
      ...(args.status === "revoked" ? { revokedAt: now } : {})
    });
    const installation = await ctx.db
      .query("installations")
      .withIndex("by_installation_id", (q) => q.eq("installationId", activation.installationId))
      .unique();
    if (installation && args.status !== "active") await ctx.db.patch(installation._id, { status: "revoked" });
    if (installation && args.status === "active") await ctx.db.patch(installation._id, { status: "active" });
    return { updated: true };
  }
});

export const activateSetupKey = internalMutation({
  args: {
    setupKey: v.string(),
    hubFingerprint: v.string(),
    hubLabel: v.optional(v.string())
  },
  returns: activationLeaseValidator,
  handler: async (ctx, args) => {
    const normalized = normalizeSetupKey(args.setupKey);
    if (!normalized) throw new Error("Setup key is required");
    const keyHash = await sha256Hex(normalized);
    const key = await ctx.db
      .query("licenseKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!key || key.status !== "active") throw new Error("Setup key is invalid or already used");

    const now = nowIso();
    if (key.validUntil <= now) {
      await ctx.db.patch(key._id, { status: "expired" });
      throw new Error("Setup key is expired");
    }
    const restaurant = await ctx.db.get(key.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");
    const existingActivation = await activeActivationForRestaurant(ctx, key.restaurantId);
    if (existingActivation) throw new Error("This restaurant already has an active hub. Reset it from platform admin first.");

    const installationId = `hub_${randomHex(12)}`;
    const syncSecret = randomHex(32);
    const leaseExpiresAt = minIso(addDaysUtc(now, LEASE_DAYS), key.validUntil);
    const activationId = await ctx.db.insert("licenseActivations", {
      restaurantId: key.restaurantId,
      licenseKeyId: key._id,
      installationId,
      syncSecret,
      hubFingerprint: args.hubFingerprint,
      ...(args.hubLabel?.trim() ? { hubLabel: args.hubLabel.trim() } : {}),
      status: "active",
      activatedAt: now,
      lastSeenAt: now,
      lastLicenseCheckAt: now,
      leaseExpiresAt,
      licenseValidUntil: key.validUntil
    });
    await ctx.db.insert("installations", {
      restaurantId: key.restaurantId,
      installationId,
      syncSecret,
      status: "active",
      createdAt: now,
      lastSeenAt: now
    });
    await ctx.db.patch(key._id, { status: "redeemed", redeemedAt: now });
    const activation = await ctx.db.get(activationId);
    if (!activation) throw new Error("Activation failed");
    return createLease(restaurant, activation, now, "active");
  }
});

export const checkLicense = internalMutation({
  args: {
    installationId: v.string(),
    syncSecret: v.string(),
    hubFingerprint: v.optional(v.string())
  },
  returns: activationLeaseValidator,
  handler: async (ctx, args) => {
    const activation = await ctx.db
      .query("licenseActivations")
      .withIndex("by_installation_id", (q) => q.eq("installationId", args.installationId))
      .unique();
    if (!activation || activation.syncSecret !== args.syncSecret) throw new Error("Unauthorized installation");
    const restaurant = await ctx.db.get(activation.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");
    const now = nowIso();
    let result: "active" | "warning" | "expired" | "suspended" | "revoked" = "active";
    if (activation.status === "suspended" || activation.status === "reset") result = "suspended";
    if (activation.status === "revoked") result = "revoked";
    if (activation.licenseValidUntil <= now) result = "expired";
    if (result === "expired") {
      const key = await ctx.db.get(activation.licenseKeyId);
      if (key && key.status !== "expired") await ctx.db.patch(key._id, { status: "expired" });
    }
    if (args.hubFingerprint && args.hubFingerprint !== activation.hubFingerprint) {
      throw new Error("Hub fingerprint does not match this activation");
    }

    const leaseExpiresAt = result === "active" ? minIso(addDaysUtc(now, LEASE_DAYS), activation.licenseValidUntil) : now;
    await ctx.db.patch(activation._id, {
      lastSeenAt: now,
      lastLicenseCheckAt: now,
      leaseExpiresAt
    });
    await ctx.db.insert("licenseCheckRecords", {
      restaurantId: activation.restaurantId,
      activationId: activation._id,
      installationId: activation.installationId,
      checkedAt: now,
      result,
      leaseExpiresAt,
      licenseValidUntil: activation.licenseValidUntil
    });
    const updatedActivation = await ctx.db.get(activation._id);
    if (!updatedActivation) throw new Error("Activation not found");
    return createLease(restaurant, updatedActivation, now, result);
  }
});
