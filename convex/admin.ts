import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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

const dailyReportListValidator = v.array(v.any());
const dailyReportDetailValidator = v.union(v.null(), v.any());

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
    return [];
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
    throw new Error("Cloud support commands were removed. Use hub-local admin tools instead.");
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
    return [];
  }
});

export const listDailyReports = query({
  args: { restaurantId: v.id("restaurants") },
  returns: dailyReportListValidator,
  handler: async (ctx, args) => {
    await requireRestaurantMember(ctx, args.restaurantId);
    return [];
  }
});

export const getDailyReport = query({
  args: { restaurantId: v.id("restaurants"), businessDate: v.string() },
  returns: dailyReportDetailValidator,
  handler: async (ctx, args) => {
    await requireRestaurantMember(ctx, args.restaurantId);
    return null;
  }
});
