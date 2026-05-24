import { v } from "convex/values";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { hubCommandType } from "./admin/access";

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

export const ingestEvents = internalMutation({
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
    return { inserted: 0 };
  }
});

export const pullHubSnapshot = internalMutation({
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
    return { cursor: args.cursor ?? "", commands: [] };
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
    throw new Error("Cloud support commands were removed. Use hub-local admin tools instead.");
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
