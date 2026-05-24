import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const membershipRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("reporting"));
export const inviteRole = v.union(v.literal("admin"), v.literal("reporting"));
export const hubCommandType = v.union(
  v.literal("device.revoked"),
  v.literal("device.updated"),
  v.literal("menu_item.upsert"),
  v.literal("menu_item.disabled"),
  v.literal("production_unit.upsert"),
  v.literal("receipt_printer.updated")
);

export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function platformAdminAllowlist() {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
}

function platformAdminTokenAllowlist() {
  const raw = process.env.PLATFORM_ADMIN_TOKEN_IDENTIFIERS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function randomHex(bytes: number) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function platformAdminAccess(identity: { email?: string; tokenIdentifier: string } | null) {
  const allowedEmails = platformAdminAllowlist();
  const allowedTokens = platformAdminTokenAllowlist();
  const email = identity?.email ? normalizeEmail(identity.email) : "";
  const tokenIdentifier = identity?.tokenIdentifier ?? "";
  const emailAllowed = Boolean(email && allowedEmails.includes(email));
  const tokenAllowed = Boolean(tokenIdentifier && allowedTokens.includes(tokenIdentifier));
  return {
    email,
    tokenIdentifier,
    allowed: emailAllowed || tokenAllowed,
    allowlistConfigured: allowedEmails.length > 0 || allowedTokens.length > 0
  };
}

export async function requirePlatformAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await requireIdentity(ctx);
  const access = platformAdminAccess(identity);
  if (!access.allowed) throw new Error("Only platform admins can do that");
  return { identity, email: access.email, tokenIdentifier: access.tokenIdentifier };
}

export async function requireRestaurantAdmin(ctx: QueryCtx | MutationCtx, restaurantId: Id<"restaurants">) {
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

export async function requireRestaurantMember(ctx: QueryCtx | MutationCtx, restaurantId: Id<"restaurants">) {
  const identity = await requireIdentity(ctx);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_restaurant_and_user", (q) =>
      q.eq("restaurantId", restaurantId).eq("userTokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  if (!membership) throw new Error("Not authorized for this restaurant");
  return { identity, membership };
}

export async function requireRestaurantOwner(ctx: QueryCtx | MutationCtx, restaurantId: Id<"restaurants">) {
  const result = await requireRestaurantAdmin(ctx, restaurantId);
  if (result.membership.role !== "owner") throw new Error("Only restaurant owners can do that");
  return result;
}
