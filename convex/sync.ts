import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const hubCommandType = v.union(
  v.literal("device.revoked"),
  v.literal("device.updated"),
  v.literal("menu_item.upsert"),
  v.literal("menu_item.disabled"),
  v.literal("production_unit.upsert"),
  v.literal("receipt_printer.updated")
);
type HubCommandType =
  | "device.revoked"
  | "device.updated"
  | "menu_item.upsert"
  | "menu_item.disabled"
  | "production_unit.upsert"
  | "receipt_printer.updated";

function normalizeHubCommandPayload(type: HubCommandType, payloadJson: string): string {
  if (!payloadJson.trim()) throw new Error("Command payload JSON is required");
  const payload = JSON.parse(payloadJson) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Command payload must be a JSON object");
  }
  const normalized = { ...(payload as Record<string, unknown>) };

  if (type === "device.revoked" || type === "device.updated") {
    const hubDeviceId = normalized.hubDeviceId;
    if (typeof hubDeviceId !== "string" || !hubDeviceId.trim()) {
      throw new Error("Device commands require hubDeviceId");
    }
    normalized.hubDeviceId = hubDeviceId.trim();
    delete normalized.localDeviceId;
  }

  return JSON.stringify(normalized);
}

async function requireRestaurantAdmin(ctx: MutationCtx, restaurantId: Id<"restaurants">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_restaurant_and_user", (q) =>
      q.eq("restaurantId", restaurantId).eq("userTokenIdentifier", identity.tokenIdentifier)
    )
    .unique();
  if (!membership || !["owner", "admin"].includes(membership.role)) throw new Error("Not authorized for this restaurant");
  return { identity, membership };
}

async function requireRestaurantOwner(ctx: MutationCtx, restaurantId: Id<"restaurants">) {
  const result = await requireRestaurantAdmin(ctx, restaurantId);
  if (result.membership.role !== "owner") throw new Error("Only restaurant owners can do that");
  return result;
}

type DailyReportPayload = {
  posDayId?: string;
  businessDate?: string;
  finalizedAt?: string;
  openOrders?: number;
  billedOrders?: number;
  paidBills?: number;
  unpaidBills?: number;
  cancelledOrders?: number;
  billCount?: number;
  grossSalesPaise?: number;
  discountPaise?: number;
  tipPaise?: number;
  finalSalesPaise?: number;
  cashPaymentsPaise?: number;
  upiPaymentsPaise?: number;
  cardPaymentsPaise?: number;
  onlinePaymentsPaise?: number;
  totalPaymentsPaise?: number;
  nonCashPaymentsPaise?: number;
  billSummaries?: Array<{
    billId: string;
    orderId: string;
    tableName: string;
    status: string;
    totalPaise: number;
    discountPaise: number;
    tipPaise: number;
    finalTotalPaise: number;
    paidPaise: number;
    settledAt: string | null;
    payments: Array<{ method: string; amountPaise: number; reference: string | null }>;
    isNc?: boolean;
    ncReason?: string | null;
    revisionNumber?: number;
  }>;
  itemSummaries?: Array<{
    menuItemId: string;
    name: string;
    saleGroupId?: string;
    saleGroupName?: string;
    saleGroupKind?: string;
    quantity: number;
    grossSalesPaise: number;
    ncQuantity?: number;
    ncGrossSalesPaise?: number;
  }>;
  groupSummaries?: Array<{
    saleGroupId: string;
    name: string;
    kind: string;
    quantity: number;
    grossSalesPaise: number;
    taxPaise: number;
    finalSalesPaise: number;
    ncQuantity: number;
    ncGrossSalesPaise: number;
  }>;
};

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function upsertDailyReport(
  ctx: MutationCtx,
  restaurantId: Id<"restaurants">,
  payloadJson: string,
  receivedAt: string
) {
  const payload = JSON.parse(payloadJson) as DailyReportPayload;
  const businessDate = payload.businessDate;
  const posDayId = payload.posDayId;
  if (!businessDate || !posDayId) throw new Error("Daily report is missing business date or day id");

  const existing = (
    await ctx.db
      .query("dailyReports")
      .withIndex("by_restaurant_and_businessDate", (q) => q.eq("restaurantId", restaurantId).eq("businessDate", businessDate))
      .take(1)
  )[0];
  const report = {
    restaurantId,
    posDayId,
    businessDate,
    status: "finalized" as const,
    grossSalesPaise: numberOrZero(payload.grossSalesPaise),
    discountPaise: numberOrZero(payload.discountPaise),
    tipPaise: numberOrZero(payload.tipPaise),
    finalSalesPaise: numberOrZero(payload.finalSalesPaise),
    cashPaymentsPaise: numberOrZero(payload.cashPaymentsPaise),
    upiPaymentsPaise: numberOrZero(payload.upiPaymentsPaise),
    cardPaymentsPaise: numberOrZero(payload.cardPaymentsPaise),
    onlinePaymentsPaise: numberOrZero(payload.onlinePaymentsPaise),
    totalPaymentsPaise: numberOrZero(payload.totalPaymentsPaise),
    nonCashPaymentsPaise: numberOrZero(payload.nonCashPaymentsPaise),
    billCount: numberOrZero(payload.billCount),
    openOrders: numberOrZero(payload.openOrders),
    billedOrders: numberOrZero(payload.billedOrders),
    paidBills: numberOrZero(payload.paidBills),
    unpaidBills: numberOrZero(payload.unpaidBills),
    cancelledOrders: numberOrZero(payload.cancelledOrders),
    finalizedAt: payload.finalizedAt ?? receivedAt,
    updatedAt: receivedAt
  };

  if (existing) await ctx.db.patch(existing._id, report);
  else await ctx.db.insert("dailyReports", report);

  for (const bill of payload.billSummaries ?? []) {
    const existingBill = await ctx.db
      .query("dailyReportBills")
      .withIndex("by_restaurant_and_billId", (q) => q.eq("restaurantId", restaurantId).eq("billId", bill.billId))
      .unique();
    const billDoc = {
      restaurantId,
      businessDate,
      posDayId,
      billId: bill.billId,
      orderId: bill.orderId,
      tableName: bill.tableName,
      status: bill.status,
      totalPaise: numberOrZero(bill.totalPaise),
      discountPaise: numberOrZero(bill.discountPaise),
      tipPaise: numberOrZero(bill.tipPaise),
      finalTotalPaise: numberOrZero(bill.finalTotalPaise),
      paidPaise: numberOrZero(bill.paidPaise),
      isNc: Boolean(bill.isNc),
      ...(bill.ncReason ? { ncReason: bill.ncReason } : {}),
      revisionNumber: numberOrZero(bill.revisionNumber),
      paymentsJson: JSON.stringify(bill.payments ?? []),
      ...(bill.settledAt ? { settledAt: bill.settledAt } : {}),
      updatedAt: receivedAt
    };
    if (existingBill) await ctx.db.patch(existingBill._id, billDoc);
    else await ctx.db.insert("dailyReportBills", billDoc);
  }

  for (const item of payload.itemSummaries ?? []) {
    const existingItem = (
      await ctx.db
        .query("dailyReportItems")
        .withIndex("by_restaurant_date_and_menuItem", (q) =>
          q.eq("restaurantId", restaurantId).eq("businessDate", businessDate).eq("menuItemId", item.menuItemId)
        )
        .take(1)
    )[0];
    const itemDoc = {
      restaurantId,
      businessDate,
      posDayId,
      menuItemId: item.menuItemId,
      name: item.name,
      saleGroupId: item.saleGroupId ?? "",
      saleGroupName: item.saleGroupName ?? "",
      saleGroupKind: item.saleGroupKind ?? "",
      quantity: numberOrZero(item.quantity),
      grossSalesPaise: numberOrZero(item.grossSalesPaise),
      ncQuantity: numberOrZero(item.ncQuantity),
      ncGrossSalesPaise: numberOrZero(item.ncGrossSalesPaise),
      updatedAt: receivedAt
    };
    if (existingItem) await ctx.db.patch(existingItem._id, itemDoc);
    else await ctx.db.insert("dailyReportItems", itemDoc);
  }

  for (const group of payload.groupSummaries ?? []) {
    const existingGroup = (
      await ctx.db
        .query("dailyReportGroups")
        .withIndex("by_restaurant_date_and_group", (q) =>
          q.eq("restaurantId", restaurantId).eq("businessDate", businessDate).eq("saleGroupId", group.saleGroupId)
        )
        .take(1)
    )[0];
    const groupDoc = {
      restaurantId,
      businessDate,
      posDayId,
      saleGroupId: group.saleGroupId,
      name: group.name,
      kind: group.kind,
      quantity: numberOrZero(group.quantity),
      grossSalesPaise: numberOrZero(group.grossSalesPaise),
      taxPaise: numberOrZero(group.taxPaise),
      finalSalesPaise: numberOrZero(group.finalSalesPaise),
      ncQuantity: numberOrZero(group.ncQuantity),
      ncGrossSalesPaise: numberOrZero(group.ncGrossSalesPaise),
      updatedAt: receivedAt
    };
    if (existingGroup) await ctx.db.patch(existingGroup._id, groupDoc);
    else await ctx.db.insert("dailyReportGroups", groupDoc);
  }
}

export const ingestEvents = mutation({
  args: {
    installationId: v.string(),
    syncSecret: v.string(),
    events: v.array(
      v.object({
        eventId: v.string(),
        type: v.string(),
        aggregateType: v.string(),
        aggregateId: v.string(),
        payloadJson: v.string(),
        createdAt: v.string()
      })
    )
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args) => {
    if (args.events.length > 100) throw new Error("Too many events in one sync batch");
    const installation = await ctx.db
      .query("installations")
      .withIndex("by_installation_id", (q) => q.eq("installationId", args.installationId))
      .unique();
    if (!installation || installation.status !== "active" || installation.syncSecret !== args.syncSecret) {
      throw new Error("Unauthorized installation");
    }
    await ctx.db.patch(installation._id, { lastSeenAt: new Date().toISOString() });

    let inserted = 0;
    const receivedAt = new Date().toISOString();
    for (const event of args.events) {
      const existing = await ctx.db
        .query("syncedEvents")
        .withIndex("by_event_id", (q) => q.eq("eventId", event.eventId))
        .unique();

      if (existing) continue;

      if (event.type === "daily_report.finalized") {
        await upsertDailyReport(ctx, installation.restaurantId, event.payloadJson, receivedAt);
      }

      await ctx.db.insert("syncedEvents", {
        ...event,
        restaurantId: installation.restaurantId,
        receivedAt
      });
      inserted += 1;
    }

    return { inserted };
  }
});

export const pullHubSnapshot = mutation({
  args: {
    installationId: v.string(),
    syncSecret: v.string(),
    cursor: v.optional(v.string())
  },
  returns: v.object({
    cursor: v.string(),
    commands: v.array(
      v.object({
        commandId: v.string(),
        type: hubCommandType,
        payloadJson: v.string(),
        createdAt: v.string()
      })
    )
  }),
  handler: async (ctx, args) => {
    const installation = await ctx.db
      .query("installations")
      .withIndex("by_installation_id", (q) => q.eq("installationId", args.installationId))
      .unique();

    if (!installation || installation.status !== "active" || installation.syncSecret !== args.syncSecret) {
      throw new Error("Unauthorized installation");
    }

    await ctx.db.patch(installation._id, { lastSeenAt: new Date().toISOString() });

    const commands = await ctx.db
      .query("hubCommands")
      .withIndex("by_restaurant_and_createdAt", (q) => {
        const scoped = q.eq("restaurantId", installation.restaurantId);
        return args.cursor ? scoped.gt("createdAt", args.cursor) : scoped;
      })
      .order("asc")
      .take(100);

    const last = commands.at(-1);
    return {
      cursor: last?.createdAt ?? args.cursor ?? "",
      commands: commands.map((command) => ({
        commandId: command.commandId,
        type: command.type,
        payloadJson: command.payloadJson,
        createdAt: command.createdAt
      }))
    };
  }
});

export const enqueueHubCommand = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    commandId: v.string(),
    type: hubCommandType,
    payloadJson: v.string()
  },
  returns: v.object({ commandId: v.string(), inserted: v.boolean() }),
  handler: async (ctx, args) => {
    await requireRestaurantAdmin(ctx, args.restaurantId);
    const payloadJson = normalizeHubCommandPayload(args.type, args.payloadJson);
    const existing = await ctx.db
      .query("hubCommands")
      .withIndex("by_command_id", (q) => q.eq("commandId", args.commandId))
      .unique();
    if (existing) return { commandId: args.commandId, inserted: false };

    await ctx.db.insert("hubCommands", {
      ...args,
      payloadJson,
      createdAt: new Date().toISOString()
    });
    return { commandId: args.commandId, inserted: true };
  }
});

export const registerInstallation = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    installationId: v.string(),
    syncSecret: v.string()
  },
  returns: v.object({ installationId: v.string() }),
  handler: async (ctx, args) => {
    await requireRestaurantOwner(ctx, args.restaurantId);
    const installationId = args.installationId.trim();
    const syncSecret = args.syncSecret.trim();
    if (!installationId) throw new Error("Installation id is required");
    if (!syncSecret) throw new Error("Sync secret is required");
    const existing = await ctx.db
      .query("installations")
      .withIndex("by_installation_id", (q) => q.eq("installationId", installationId))
      .unique();
    const now = new Date().toISOString();
    if (existing) {
      if (existing.restaurantId !== args.restaurantId) {
        throw new Error("Installation id is already registered to another restaurant");
      }
      await ctx.db.patch(existing._id, {
        restaurantId: args.restaurantId,
        syncSecret,
        status: "active"
      });
      return { installationId };
    }

    await ctx.db.insert("installations", {
      restaurantId: args.restaurantId,
      installationId,
      syncSecret,
      status: "active",
      createdAt: now
    });
    return { installationId };
  }
});
