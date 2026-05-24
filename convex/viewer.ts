import { v } from "convex/values";
import { platformAdminAccess } from "./admin/access";
import { query } from "./_generated/server";

export const get = query({
  args: {},
  returns: v.object({
    tokenIdentifier: v.string(),
    subject: v.string(),
    name: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
    pictureUrl: v.union(v.string(), v.null())
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    return {
      tokenIdentifier: identity.tokenIdentifier,
      subject: identity.subject,
      name: identity.name ?? null,
      email: identity.email ?? null,
      pictureUrl: identity.pictureUrl ?? null
    };
  }
});

export const platformAdminStatus = query({
  args: {},
  returns: v.object({
    authenticated: v.boolean(),
    allowed: v.boolean(),
    email: v.union(v.string(), v.null()),
    tokenIdentifier: v.union(v.string(), v.null()),
    allowlistConfigured: v.boolean()
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const access = platformAdminAccess(identity);
    return {
      authenticated: Boolean(identity),
      allowed: access.allowed,
      email: access.email || null,
      tokenIdentifier: access.tokenIdentifier || null,
      allowlistConfigured: access.allowlistConfigured
    };
  }
});
