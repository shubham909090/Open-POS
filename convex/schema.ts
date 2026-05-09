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
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("cashier"), v.literal("waiter"), v.literal("kitchen")),
    pairedAt: v.string(),
    revokedAt: v.optional(v.string())
  }).index("by_restaurant", ["restaurantId"]),
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
