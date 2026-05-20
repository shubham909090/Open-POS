import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { normalizeHubCommandPayload, type HubCommandType } from "./hubCommands";
import { hubCommandType, randomHex, requireRestaurantAdmin, requireRestaurantMember, requireRestaurantOwner } from "./admin/access";
import {
  acceptPendingInvitation,
  createRestaurantForCurrentUser,
  inviteRestaurantStaff,
  listPendingInvitationsForCurrentUser,
  listRestaurantStaff,
  listRestaurantsForCurrentUser,
  pendingInvitationListValidator,
  removeRestaurantMember,
  restaurantListValidator,
  revokeStaffInvitation,
  staffListValidator,
  updateRestaurantMemberRole
} from "./admin/membership";
import {
  dailyReportDetailValidator,
  dailyReportListValidator,
  toDailyReportDetail,
  toDailyReportListItem
} from "./admin/reportModels";

export const listRestaurants = query({
  args: {},
  returns: restaurantListValidator,
  handler: listRestaurantsForCurrentUser
});

export const createRestaurant = mutation({
  args: {
    name: v.string(),
    timezone: v.string()
  },
  returns: v.object({ restaurantId: v.id("restaurants") }),
  handler: createRestaurantForCurrentUser
});

export const listMyPendingInvitations = query({
  args: {},
  returns: pendingInvitationListValidator,
  handler: listPendingInvitationsForCurrentUser
});

export const acceptInvitation = mutation({
  args: { invitationId: v.id("memberInvitations") },
  returns: v.object({ restaurantId: v.id("restaurants") }),
  handler: async (ctx, args) => acceptPendingInvitation(ctx, args.invitationId)
});

export const listStaff = query({
  args: { restaurantId: v.id("restaurants") },
  returns: staffListValidator,
  handler: async (ctx, args) => listRestaurantStaff(ctx, args.restaurantId)
});

export const inviteStaff = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("reporting"))
  },
  returns: v.object({ invitationId: v.id("memberInvitations"), updated: v.boolean() }),
  handler: inviteRestaurantStaff
});

export const updateMemberRole = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    membershipId: v.id("memberships"),
    role: v.union(v.literal("admin"), v.literal("reporting"))
  },
  returns: v.object({ updated: v.boolean() }),
  handler: updateRestaurantMemberRole
});

export const removeMember = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    membershipId: v.id("memberships")
  },
  returns: v.object({ removed: v.boolean() }),
  handler: removeRestaurantMember
});

export const revokeInvitation = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    invitationId: v.id("memberInvitations")
  },
  returns: v.object({ revoked: v.boolean() }),
  handler: revokeStaffInvitation
});

export const listInstallations = query({
  args: { restaurantId: v.id("restaurants") },
  returns: v.array(
    v.object({
      installationId: v.string(),
      status: v.union(v.literal("active"), v.literal("revoked")),
      createdAt: v.string(),
      lastSeenAt: v.optional(v.string())
    })
  ),
  handler: async (ctx, args) => {
    await requireRestaurantAdmin(ctx, args.restaurantId);
    const rows = await ctx.db
      .query("installations")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .take(100);
    return rows
      .map((row) => ({
        installationId: row.installationId,
        status: row.status,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt
      }));
  }
});

export const registerInstallation = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    installationId: v.string(),
    syncSecret: v.string()
  },
  returns: v.object({ installationId: v.string(), updated: v.boolean() }),
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
      return { installationId, updated: true };
    }

    await ctx.db.insert("installations", {
      restaurantId: args.restaurantId,
      installationId,
      syncSecret,
      status: "active",
      createdAt: now
    });

    return { installationId, updated: false };
  }
});

export const createHubConnection = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    label: v.optional(v.string())
  },
  returns: v.object({
    installationId: v.string(),
    syncSecret: v.string(),
    envBlock: v.string()
  }),
  handler: async (ctx, args) => {
    await requireRestaurantOwner(ctx, args.restaurantId);
    const now = new Date().toISOString();
    let installationId = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = randomHex(4);
      const label = args.label?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "main-hub";
      installationId = `${label}-${suffix}`;
      const existing = await ctx.db
        .query("installations")
        .withIndex("by_installation_id", (q) => q.eq("installationId", installationId))
        .unique();
      if (!existing) break;
      installationId = "";
    }
    if (!installationId) throw new Error("Could not create a hub connection. Please try again.");

    const syncSecret = randomHex(32);
    await ctx.db.insert("installations", {
      restaurantId: args.restaurantId,
      installationId,
      syncSecret,
      status: "active",
      createdAt: now
    });

    return {
      installationId,
      syncSecret,
      envBlock: [
        `POS_INSTALLATION_ID=${installationId}`,
        `POS_SYNC_SECRET=${syncSecret}`,
        "CONVEX_HTTP_URL=<your Convex site URL>"
      ].join("\n")
    };
  }
});

export const listHubCommands = query({
  args: { restaurantId: v.id("restaurants") },
  returns: v.array(
    v.object({
      commandId: v.string(),
      type: hubCommandType,
      payloadJson: v.string(),
      createdAt: v.string()
    })
  ),
  handler: async (ctx, args) => {
    await requireRestaurantAdmin(ctx, args.restaurantId);
    const rows = await ctx.db
      .query("hubCommands")
      .withIndex("by_restaurant_and_createdAt", (q) => q.eq("restaurantId", args.restaurantId))
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      commandId: row.commandId,
      type: row.type,
      payloadJson: row.payloadJson,
      createdAt: row.createdAt
    }));
  }
});

export const enqueueHubCommand = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    type: hubCommandType,
    payloadJson: v.string()
  },
  returns: v.object({ commandId: v.string(), inserted: v.boolean() }),
  handler: async (ctx, args) => {
    await requireRestaurantAdmin(ctx, args.restaurantId);
    const payloadJson = normalizeHubCommandPayload(args.type, args.payloadJson);
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await ctx.db.insert("hubCommands", {
      commandId,
      restaurantId: args.restaurantId,
      type: args.type,
      payloadJson,
      createdAt: new Date().toISOString()
    });
    return { commandId, inserted: true };
  }
});

export const listRecentEvents = query({
  args: { restaurantId: v.id("restaurants") },
  returns: v.array(
    v.object({
      eventId: v.string(),
      type: v.string(),
      aggregateType: v.string(),
      aggregateId: v.string(),
      createdAt: v.string(),
      receivedAt: v.string()
    })
  ),
  handler: async (ctx, args) => {
    await requireRestaurantMember(ctx, args.restaurantId);
    const rows = await ctx.db
      .query("syncedEvents")
      .withIndex("by_restaurant_and_receivedAt", (q) => q.eq("restaurantId", args.restaurantId))
      .order("desc")
      .take(50);
    return rows
      .map((row) => ({
        eventId: row.eventId,
        type: row.type,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        createdAt: row.createdAt,
        receivedAt: row.receivedAt
      }));
  }
});

export const listDailyReports = query({
  args: { restaurantId: v.id("restaurants") },
  returns: dailyReportListValidator,
  handler: async (ctx, args) => {
    await requireRestaurantMember(ctx, args.restaurantId);
    const rows = await ctx.db
      .query("dailyReports")
      .withIndex("by_restaurant_and_updatedAt", (q) => q.eq("restaurantId", args.restaurantId))
      .order("desc")
      .take(60);
    return rows.map(toDailyReportListItem);
  }
});

export const getDailyReport = query({
  args: { restaurantId: v.id("restaurants"), businessDate: v.string() },
  returns: dailyReportDetailValidator,
  handler: async (ctx, args) => {
    await requireRestaurantMember(ctx, args.restaurantId);
    const report = (
      await ctx.db
        .query("dailyReports")
        .withIndex("by_restaurant_and_businessDate", (q) =>
          q.eq("restaurantId", args.restaurantId).eq("businessDate", args.businessDate)
        )
        .take(1)
    )[0];
    if (!report) return null;

    const bills = await ctx.db
      .query("dailyReportBills")
      .withIndex("by_restaurant_and_businessDate", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("businessDate", args.businessDate)
      )
      .take(500);
    const items = await ctx.db
      .query("dailyReportItems")
      .withIndex("by_restaurant_and_businessDate", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("businessDate", args.businessDate)
      )
      .take(500);
    const groups = await ctx.db
      .query("dailyReportGroups")
      .withIndex("by_restaurant_and_businessDate", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("businessDate", args.businessDate)
      )
      .take(100);

    return toDailyReportDetail(report, bills, items, groups);
  }
});
