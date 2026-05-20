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

export function randomHex(bytes: number) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
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
