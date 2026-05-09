import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const ingestEvents = mutation({
  args: {
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
  handler: async (ctx, args) => {
    let inserted = 0;
    for (const event of args.events) {
      const existing = await ctx.db
        .query("syncedEvents")
        .withIndex("by_event_id", (q) => q.eq("eventId", event.eventId))
        .unique();

      if (existing) continue;

      await ctx.db.insert("syncedEvents", {
        ...event,
        receivedAt: new Date().toISOString()
      });
      inserted += 1;
    }

    return { inserted };
  }
});
