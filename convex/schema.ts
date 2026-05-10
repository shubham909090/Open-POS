import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  restaurants: defineTable({
    name: v.string(),
    timezone: v.string(),
    createdAt: v.string()
  }),
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
    role: v.union(v.literal("admin"), v.literal("cashier"), v.literal("waiter"), v.literal("kitchen")),
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
  hubCommands: defineTable({
    commandId: v.string(),
    restaurantId: v.id("restaurants"),
    type: v.union(
      v.literal("device.revoked"),
      v.literal("device.updated"),
      v.literal("menu_item.upsert"),
      v.literal("menu_item.disabled"),
      v.literal("production_unit.upsert"),
      v.literal("receipt_printer.updated")
    ),
    payloadJson: v.string(),
    createdAt: v.string()
  }).index("by_restaurant_and_createdAt", ["restaurantId", "createdAt"])
    .index("by_command_id", ["commandId"]),
  syncedEvents: defineTable({
    eventId: v.string(),
    restaurantId: v.id("restaurants"),
    type: v.string(),
    aggregateType: v.string(),
    aggregateId: v.string(),
    payloadJson: v.string(),
    createdAt: v.string(),
    receivedAt: v.string()
  })
    .index("by_event_id", ["eventId"])
    .index("by_restaurant_and_receivedAt", ["restaurantId", "receivedAt"]),
  dailyReports: defineTable({
    restaurantId: v.id("restaurants"),
    businessDate: v.string(),
    grossSalesPaise: v.number(),
    billCount: v.number(),
    updatedAt: v.string()
  }).index("by_restaurant_date", ["restaurantId", "businessDate"])
});
