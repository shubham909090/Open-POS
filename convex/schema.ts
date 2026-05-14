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
    role: v.union(v.literal("admin"), v.literal("cashier"), v.literal("captain"), v.literal("waiter"), v.literal("kitchen")),
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
    posDayId: v.string(),
    businessDate: v.string(),
    status: v.union(v.literal("finalized")),
    grossSalesPaise: v.number(),
    discountPaise: v.number(),
    tipPaise: v.number(),
    finalSalesPaise: v.number(),
    cashPaymentsPaise: v.number(),
    upiPaymentsPaise: v.number(),
    cardPaymentsPaise: v.number(),
    onlinePaymentsPaise: v.number(),
    totalPaymentsPaise: v.number(),
    nonCashPaymentsPaise: v.number(),
    billCount: v.number(),
    openOrders: v.number(),
    billedOrders: v.number(),
    paidBills: v.number(),
    unpaidBills: v.number(),
    cancelledOrders: v.number(),
    finalizedAt: v.string(),
    updatedAt: v.string()
  })
    .index("by_restaurant_and_businessDate", ["restaurantId", "businessDate"])
    .index("by_restaurant_and_updatedAt", ["restaurantId", "updatedAt"]),
  dailyReportBills: defineTable({
    restaurantId: v.id("restaurants"),
    businessDate: v.string(),
    posDayId: v.string(),
    billId: v.string(),
    orderId: v.string(),
    tableName: v.string(),
    status: v.string(),
    totalPaise: v.number(),
    discountPaise: v.number(),
    tipPaise: v.number(),
    finalTotalPaise: v.number(),
    paidPaise: v.number(),
    isNc: v.optional(v.boolean()),
    ncReason: v.optional(v.string()),
    revisionNumber: v.optional(v.number()),
    paymentsJson: v.string(),
    settledAt: v.optional(v.string()),
    updatedAt: v.string()
  })
    .index("by_restaurant_and_businessDate", ["restaurantId", "businessDate"])
    .index("by_restaurant_and_billId", ["restaurantId", "billId"]),
  dailyReportItems: defineTable({
    restaurantId: v.id("restaurants"),
    businessDate: v.string(),
    posDayId: v.string(),
    menuItemId: v.string(),
    name: v.string(),
    saleGroupId: v.optional(v.string()),
    saleGroupName: v.optional(v.string()),
    saleGroupKind: v.optional(v.string()),
    quantity: v.number(),
    grossSalesPaise: v.number(),
    ncQuantity: v.optional(v.number()),
    ncGrossSalesPaise: v.optional(v.number()),
    updatedAt: v.string()
  })
    .index("by_restaurant_and_businessDate", ["restaurantId", "businessDate"])
    .index("by_restaurant_date_and_menuItem", ["restaurantId", "businessDate", "menuItemId"]),
  dailyReportGroups: defineTable({
    restaurantId: v.id("restaurants"),
    businessDate: v.string(),
    posDayId: v.string(),
    saleGroupId: v.string(),
    name: v.string(),
    kind: v.string(),
    quantity: v.number(),
    grossSalesPaise: v.number(),
    taxPaise: v.number(),
    finalSalesPaise: v.number(),
    ncQuantity: v.number(),
    ncGrossSalesPaise: v.number(),
    updatedAt: v.string()
  })
    .index("by_restaurant_and_businessDate", ["restaurantId", "businessDate"])
    .index("by_restaurant_date_and_group", ["restaurantId", "businessDate", "saleGroupId"])
});
