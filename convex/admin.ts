import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const membershipRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("reporting"));
const inviteRole = v.union(v.literal("admin"), v.literal("reporting"));
const hubCommandType = v.union(
  v.literal("device.revoked"),
  v.literal("device.updated"),
  v.literal("menu_item.upsert"),
  v.literal("menu_item.disabled"),
  v.literal("production_unit.upsert"),
  v.literal("receipt_printer.updated")
);

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function randomHex(bytes: number) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function requireRestaurantAdmin(ctx: QueryCtx | MutationCtx, restaurantId: Id<"restaurants">) {
  const identity = await requireIdentity(ctx);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_restaurant_and_user", (q) =>
      q.eq("restaurantId", restaurantId).eq("userTokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  if (!membership || !["owner", "admin"].includes(membership.role)) throw new Error("Not authorized for this restaurant");
  return { identity, membership };
}

async function requireRestaurantOwner(ctx: QueryCtx | MutationCtx, restaurantId: Id<"restaurants">) {
  const result = await requireRestaurantAdmin(ctx, restaurantId);
  if (result.membership.role !== "owner") throw new Error("Only restaurant owners can do that");
  return result;
}

export const listRestaurants = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("restaurants"),
      name: v.string(),
      timezone: v.string(),
      createdAt: v.string(),
      membershipRole
    })
  ),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userTokenIdentifier", identity.tokenIdentifier))
      .take(100);

    const restaurants = [];
    for (const membership of memberships) {
      const restaurant = await ctx.db.get(membership.restaurantId);
      if (!restaurant) continue;
      restaurants.push({
        _id: restaurant._id,
        name: restaurant.name,
        timezone: restaurant.timezone,
        createdAt: restaurant.createdAt,
        membershipRole: membership.role
      });
    }

    return restaurants;
  }
});

export const createRestaurant = mutation({
  args: {
    name: v.string(),
    timezone: v.string()
  },
  returns: v.object({ restaurantId: v.id("restaurants") }),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (!args.name.trim()) throw new Error("Restaurant name is required");
    const now = new Date().toISOString();
    const restaurantId = await ctx.db.insert("restaurants", {
      name: args.name.trim(),
      timezone: args.timezone.trim() || "Asia/Kolkata",
      createdAt: now
    });

    await ctx.db.insert("memberships", {
      restaurantId,
      userTokenIdentifier: identity.tokenIdentifier,
      ...(identity.email ? { email: normalizeEmail(identity.email) } : {}),
      ...(identity.name ? { name: identity.name } : {}),
      role: "owner",
      createdAt: now
    });

    return { restaurantId };
  }
});

export const listMyPendingInvitations = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("memberInvitations"),
      restaurantId: v.id("restaurants"),
      restaurantName: v.string(),
      email: v.string(),
      role: inviteRole,
      createdAt: v.string()
    })
  ),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    if (!identity.email) return [];
    const email = normalizeEmail(identity.email);
    const rows = await ctx.db
      .query("memberInvitations")
      .withIndex("by_email_and_status", (q) => q.eq("email", email).eq("status", "pending"))
      .take(50);

    const invitations = [];
    for (const row of rows) {
      const restaurant = await ctx.db.get(row.restaurantId);
      if (!restaurant) continue;
      invitations.push({
        _id: row._id,
        restaurantId: row.restaurantId,
        restaurantName: restaurant.name,
        email: row.email,
        role: row.role,
        createdAt: row.createdAt
      });
    }
    return invitations;
  }
});

export const acceptInvitation = mutation({
  args: { invitationId: v.id("memberInvitations") },
  returns: v.object({ restaurantId: v.id("restaurants") }),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (!identity.email) throw new Error("Google account email is required to accept an invitation");
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.status !== "pending") throw new Error("Invitation is no longer pending");
    if (invitation.email !== normalizeEmail(identity.email)) throw new Error("Invitation email does not match this login");

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_restaurant_and_user", (q) =>
        q.eq("restaurantId", invitation.restaurantId).eq("userTokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    const now = new Date().toISOString();
    if (!existing) {
      await ctx.db.insert("memberships", {
        restaurantId: invitation.restaurantId,
        userTokenIdentifier: identity.tokenIdentifier,
        email: normalizeEmail(identity.email),
        ...(identity.name ? { name: identity.name } : {}),
        role: invitation.role,
        createdAt: now
      });
    }

    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedAt: now,
      acceptedUserTokenIdentifier: identity.tokenIdentifier
    });

    return { restaurantId: invitation.restaurantId };
  }
});

export const listStaff = query({
  args: { restaurantId: v.id("restaurants") },
  returns: v.object({
    members: v.array(
      v.object({
        _id: v.id("memberships"),
        email: v.optional(v.string()),
        name: v.optional(v.string()),
        role: membershipRole,
        createdAt: v.string(),
        isCurrentUser: v.boolean()
      })
    ),
    invitations: v.array(
      v.object({
        _id: v.id("memberInvitations"),
        email: v.string(),
        role: inviteRole,
        status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked")),
        createdAt: v.string(),
        acceptedAt: v.optional(v.string()),
        revokedAt: v.optional(v.string())
      })
    )
  }),
  handler: async (ctx, args) => {
    const { identity } = await requireRestaurantAdmin(ctx, args.restaurantId);
    const members = await ctx.db
      .query("memberships")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .take(100);
    const invitations = await ctx.db
      .query("memberInvitations")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .take(100);

    return {
      members: members.map((member) => ({
        _id: member._id,
        ...(member.email ? { email: member.email } : {}),
        ...(member.name ? { name: member.name } : {}),
        role: member.role,
        createdAt: member.createdAt,
        isCurrentUser: member.userTokenIdentifier === identity.tokenIdentifier
      })),
      invitations: invitations.map((invitation) => ({
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        createdAt: invitation.createdAt,
        ...(invitation.acceptedAt ? { acceptedAt: invitation.acceptedAt } : {}),
        ...(invitation.revokedAt ? { revokedAt: invitation.revokedAt } : {})
      }))
    };
  }
});

export const inviteStaff = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    email: v.string(),
    role: inviteRole
  },
  returns: v.object({ invitationId: v.id("memberInvitations"), updated: v.boolean() }),
  handler: async (ctx, args) => {
    const { identity } = await requireRestaurantAdmin(ctx, args.restaurantId);
    const email = normalizeEmail(args.email);
    if (!email || !email.includes("@")) throw new Error("Valid email is required");

    const existingMember = await ctx.db
      .query("memberships")
      .withIndex("by_restaurant_and_email", (q) => q.eq("restaurantId", args.restaurantId).eq("email", email))
      .unique();
    if (existingMember) throw new Error("That email is already a member");

    const existingInvite = await ctx.db
      .query("memberInvitations")
      .withIndex("by_restaurant_and_email", (q) => q.eq("restaurantId", args.restaurantId).eq("email", email))
      .take(10);
    const pendingInvite = existingInvite.find((invite) => invite.status === "pending");
    const now = new Date().toISOString();
    if (pendingInvite) {
      await ctx.db.patch(pendingInvite._id, {
        role: args.role,
        invitedByUserTokenIdentifier: identity.tokenIdentifier,
        createdAt: now
      });
      return { invitationId: pendingInvite._id, updated: true };
    }

    const invitationId = await ctx.db.insert("memberInvitations", {
      restaurantId: args.restaurantId,
      email,
      role: args.role,
      status: "pending",
      invitedByUserTokenIdentifier: identity.tokenIdentifier,
      createdAt: now
    });
    return { invitationId, updated: false };
  }
});

export const updateMemberRole = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    membershipId: v.id("memberships"),
    role: v.union(v.literal("admin"), v.literal("reporting"))
  },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args) => {
    const { identity } = await requireRestaurantOwner(ctx, args.restaurantId);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.restaurantId !== args.restaurantId) throw new Error("Member not found");
    if (membership.userTokenIdentifier === identity.tokenIdentifier) throw new Error("You cannot change your own owner access");
    if (membership.role === "owner") throw new Error("Owner role cannot be changed here");
    await ctx.db.patch(membership._id, { role: args.role });
    return { updated: true };
  }
});

export const removeMember = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    membershipId: v.id("memberships")
  },
  returns: v.object({ removed: v.boolean() }),
  handler: async (ctx, args) => {
    const { identity } = await requireRestaurantOwner(ctx, args.restaurantId);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.restaurantId !== args.restaurantId) throw new Error("Member not found");
    if (membership.userTokenIdentifier === identity.tokenIdentifier) throw new Error("You cannot remove yourself");
    if (membership.role === "owner") throw new Error("Owner cannot be removed here");
    await ctx.db.delete(membership._id);
    return { removed: true };
  }
});

export const revokeInvitation = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    invitationId: v.id("memberInvitations")
  },
  returns: v.object({ revoked: v.boolean() }),
  handler: async (ctx, args) => {
    await requireRestaurantAdmin(ctx, args.restaurantId);
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.restaurantId !== args.restaurantId) throw new Error("Invitation not found");
    if (invitation.status !== "pending") throw new Error("Only pending invitations can be revoked");
    await ctx.db.patch(invitation._id, { status: "revoked", revokedAt: new Date().toISOString() });
    return { revoked: true };
  }
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
    if (!args.payloadJson.trim()) throw new Error("Command payload JSON is required");
    JSON.parse(args.payloadJson);
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await ctx.db.insert("hubCommands", {
      commandId,
      restaurantId: args.restaurantId,
      type: args.type,
      payloadJson: args.payloadJson,
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
    await requireRestaurantAdmin(ctx, args.restaurantId);
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
