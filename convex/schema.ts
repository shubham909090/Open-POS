import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  restaurants: defineTable({
    name: v.string(),
    timezone: v.string(),
    createdAt: v.string()
  }),
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
  }).index("by_installation_id", ["installationId"]),
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
    restaurantId: v.optional(v.id("restaurants")),
    type: v.string(),
    aggregateType: v.string(),
    aggregateId: v.string(),
    payloadJson: v.string(),
    createdAt: v.string(),
    receivedAt: v.string()
  }).index("by_event_id", ["eventId"]),
  dailyReports: defineTable({
    restaurantId: v.id("restaurants"),
    businessDate: v.string(),
    grossSalesPaise: v.number(),
    billCount: v.number(),
    updatedAt: v.string()
  }).index("by_restaurant_date", ["restaurantId", "businessDate"])
});
