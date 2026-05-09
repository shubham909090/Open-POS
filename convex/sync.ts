import { v } from "convex/values";
import { mutation } from "./_generated/server";

const hubCommandType = v.union(
  v.literal("device.revoked"),
  v.literal("device.updated"),
  v.literal("menu_item.upsert"),
  v.literal("menu_item.disabled"),
  v.literal("production_unit.upsert"),
  v.literal("receipt_printer.updated")
);

export const ingestEvents = mutation({
  args: {
    installationId: v.optional(v.string()),
    syncSecret: v.optional(v.string()),
    events: v.array(
      v.object({
        eventId: v.string(),
        restaurantId: v.optional(v.id("restaurants")),
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
    const installationId = args.installationId;
    const installation = installationId
      ? await ctx.db
          .query("installations")
          .withIndex("by_installation_id", (q) => q.eq("installationId", installationId))
          .unique()
      : null;
    if (installation) {
      if (installation.status !== "active" || installation.syncSecret !== args.syncSecret) throw new Error("Unauthorized installation");
      await ctx.db.patch(installation._id, { lastSeenAt: new Date().toISOString() });
    }

    let inserted = 0;
    for (const event of args.events) {
      const existing = await ctx.db
        .query("syncedEvents")
        .withIndex("by_event_id", (q) => q.eq("eventId", event.eventId))
        .unique();

      if (existing) continue;

      await ctx.db.insert("syncedEvents", {
        ...event,
        restaurantId: event.restaurantId ?? installation?.restaurantId,
        receivedAt: new Date().toISOString()
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
    const existing = await ctx.db
      .query("hubCommands")
      .withIndex("by_command_id", (q) => q.eq("commandId", args.commandId))
      .unique();
    if (existing) return { commandId: args.commandId, inserted: false };

    await ctx.db.insert("hubCommands", {
      ...args,
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
    const existing = await ctx.db
      .query("installations")
      .withIndex("by_installation_id", (q) => q.eq("installationId", args.installationId))
      .unique();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        restaurantId: args.restaurantId,
        syncSecret: args.syncSecret,
        status: "active",
        lastSeenAt: now
      });
      return { installationId: args.installationId };
    }

    await ctx.db.insert("installations", {
      restaurantId: args.restaurantId,
      installationId: args.installationId,
      syncSecret: args.syncSecret,
      status: "active",
      createdAt: now,
      lastSeenAt: now
    });
    return { installationId: args.installationId };
  }
});
