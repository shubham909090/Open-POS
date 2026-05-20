import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  inviteRole,
  membershipRole,
  normalizeEmail,
  requireIdentity,
  requireRestaurantAdmin,
  requireRestaurantOwner
} from "./access";

export const restaurantListValidator = v.array(
  v.object({
    _id: v.id("restaurants"),
    name: v.string(),
    timezone: v.string(),
    createdAt: v.string(),
    membershipRole
  })
);

export const pendingInvitationListValidator = v.array(
  v.object({
    _id: v.id("memberInvitations"),
    restaurantId: v.id("restaurants"),
    restaurantName: v.string(),
    email: v.string(),
    role: inviteRole,
    createdAt: v.string()
  })
);

export const staffListValidator = v.object({
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
});

export async function listRestaurantsForCurrentUser(ctx: QueryCtx) {
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

export async function createRestaurantForCurrentUser(
  ctx: MutationCtx,
  args: { name: string; timezone: string }
) {
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

export async function listPendingInvitationsForCurrentUser(ctx: QueryCtx) {
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

export async function acceptPendingInvitation(
  ctx: MutationCtx,
  invitationId: Id<"memberInvitations">
) {
  const identity = await requireIdentity(ctx);
  if (!identity.email) throw new Error("Google account email is required to accept an invitation");
  const invitation = await ctx.db.get(invitationId);
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

export async function listRestaurantStaff(
  ctx: QueryCtx,
  restaurantId: Id<"restaurants">
) {
  const { identity } = await requireRestaurantAdmin(ctx, restaurantId);
  const members = await ctx.db
    .query("memberships")
    .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
    .take(100);
  const invitations = await ctx.db
    .query("memberInvitations")
    .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
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

export async function inviteRestaurantStaff(
  ctx: MutationCtx,
  args: { restaurantId: Id<"restaurants">; email: string; role: "admin" | "reporting" }
) {
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

export async function updateRestaurantMemberRole(
  ctx: MutationCtx,
  args: { restaurantId: Id<"restaurants">; membershipId: Id<"memberships">; role: "admin" | "reporting" }
) {
  const { identity } = await requireRestaurantOwner(ctx, args.restaurantId);
  const membership = await ctx.db.get(args.membershipId);
  if (!membership || membership.restaurantId !== args.restaurantId) throw new Error("Member not found");
  if (membership.userTokenIdentifier === identity.tokenIdentifier) throw new Error("You cannot change your own owner access");
  if (membership.role === "owner") throw new Error("Owner role cannot be changed here");
  await ctx.db.patch(membership._id, { role: args.role });
  return { updated: true };
}

export async function removeRestaurantMember(
  ctx: MutationCtx,
  args: { restaurantId: Id<"restaurants">; membershipId: Id<"memberships"> }
) {
  const { identity } = await requireRestaurantOwner(ctx, args.restaurantId);
  const membership = await ctx.db.get(args.membershipId);
  if (!membership || membership.restaurantId !== args.restaurantId) throw new Error("Member not found");
  if (membership.userTokenIdentifier === identity.tokenIdentifier) throw new Error("You cannot remove yourself");
  if (membership.role === "owner") throw new Error("Owner cannot be removed here");
  await ctx.db.delete(membership._id);
  return { removed: true };
}

export async function revokeStaffInvitation(
  ctx: MutationCtx,
  args: { restaurantId: Id<"restaurants">; invitationId: Id<"memberInvitations"> }
) {
  await requireRestaurantAdmin(ctx, args.restaurantId);
  const invitation = await ctx.db.get(args.invitationId);
  if (!invitation || invitation.restaurantId !== args.restaurantId) throw new Error("Invitation not found");
  if (invitation.status !== "pending") throw new Error("Only pending invitations can be revoked");
  await ctx.db.patch(invitation._id, { status: "revoked", revokedAt: new Date().toISOString() });
  return { revoked: true };
}
