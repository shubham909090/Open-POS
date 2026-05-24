import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { activationStatusValidator, backupDomainValidator, leaseStatusValidator, licenseStatusValidator } from "./backupModel";

export default defineSchema({
  restaurants: defineTable({
    name: v.string(),
    timezone: v.string(),
    createdAt: v.string()
  }).index("by_createdAt", ["createdAt"]),
  memberships: defineTable({
    restaurantId: v.id("restaurants"),
    userTokenIdentifier: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("reporting")),
    createdAt: v.string()
  })
    .index("by_user", ["userTokenIdentifier"])
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_and_user", ["restaurantId", "userTokenIdentifier"])
    .index("by_restaurant_and_email", ["restaurantId", "email"]),
  memberInvitations: defineTable({
    restaurantId: v.id("restaurants"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("reporting")),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked")),
    invitedByUserTokenIdentifier: v.string(),
    createdAt: v.string(),
    acceptedAt: v.optional(v.string()),
    acceptedUserTokenIdentifier: v.optional(v.string()),
    revokedAt: v.optional(v.string())
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_and_email", ["restaurantId", "email"])
    .index("by_email_and_status", ["email", "status"]),
  devices: defineTable({
    restaurantId: v.id("restaurants"),
    hubDeviceId: v.optional(v.string()),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("captain"), v.literal("waiter"), v.literal("kitchen")),
    pairedAt: v.string(),
    revokedAt: v.optional(v.string())
  }).index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_and_hub_device", ["restaurantId", "hubDeviceId"]),
  installations: defineTable({
    installationId: v.string(),
    restaurantId: v.id("restaurants"),
    syncSecret: v.string(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    createdAt: v.string(),
    lastSeenAt: v.optional(v.string())
  })
    .index("by_installation_id", ["installationId"])
    .index("by_restaurant", ["restaurantId"]),
  licenseKeys: defineTable({
    restaurantId: v.id("restaurants"),
    keyHash: v.string(),
    keyPrefix: v.string(),
    keySuffix: v.string(),
    label: v.string(),
    months: v.number(),
    validFrom: v.string(),
    validUntil: v.string(),
    status: licenseStatusValidator,
    createdAt: v.string(),
    createdByUserTokenIdentifier: v.string(),
    redeemedAt: v.optional(v.string()),
    revokedAt: v.optional(v.string())
  })
    .index("by_hash", ["keyHash"])
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_and_status", ["restaurantId", "status"]),
  licenseActivations: defineTable({
    restaurantId: v.id("restaurants"),
    licenseKeyId: v.id("licenseKeys"),
    installationId: v.string(),
    syncSecret: v.string(),
    hubFingerprint: v.string(),
    hubLabel: v.optional(v.string()),
    status: activationStatusValidator,
    activatedAt: v.string(),
    lastSeenAt: v.optional(v.string()),
    lastLicenseCheckAt: v.optional(v.string()),
    leaseExpiresAt: v.string(),
    licenseValidUntil: v.string(),
    suspendedAt: v.optional(v.string()),
    resetAt: v.optional(v.string()),
    revokedAt: v.optional(v.string())
  })
    .index("by_installation_id", ["installationId"])
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_and_status", ["restaurantId", "status"]),
  licenseCheckRecords: defineTable({
    restaurantId: v.id("restaurants"),
    activationId: v.id("licenseActivations"),
    installationId: v.string(),
    checkedAt: v.string(),
    result: leaseStatusValidator,
    leaseExpiresAt: v.string(),
    licenseValidUntil: v.string()
  })
    .index("by_activation_and_checkedAt", ["activationId", "checkedAt"])
    .index("by_restaurant_and_checkedAt", ["restaurantId", "checkedAt"]),
  backupRows: defineTable({
    restaurantId: v.id("restaurants"),
    activationId: v.optional(v.id("licenseActivations")),
    domain: backupDomainValidator,
    localId: v.string(),
    businessDate: v.optional(v.string()),
    localUpdatedAt: v.optional(v.string()),
    payloadJson: v.string(),
    payloadHash: v.string(),
    deletedAt: v.optional(v.string()),
    sourceVersion: v.number(),
    updatedAt: v.string(),
    receivedAt: v.string()
  })
    .index("by_restaurant_domain_localId", ["restaurantId", "domain", "localId"])
    .index("by_restaurant_domain_businessDate_localId", ["restaurantId", "domain", "businessDate", "localId"])
    .index("by_restaurant_domain_updatedAt_localId", ["restaurantId", "domain", "updatedAt", "localId"]),
  backupManifests: defineTable({
    restaurantId: v.id("restaurants"),
    domain: backupDomainValidator,
    lastBatchRowCount: v.number(),
    lastBusinessDate: v.optional(v.string()),
    lastUpdatedAt: v.optional(v.string()),
    lastReceivedAt: v.string()
  })
    .index("by_restaurant_and_domain", ["restaurantId", "domain"])
    .index("by_restaurant_and_receivedAt", ["restaurantId", "lastReceivedAt"])
});
