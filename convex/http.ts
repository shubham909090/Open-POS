import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/pos/ingest-events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = process.env.POS_SYNC_SECRET;
    const receivedSecret = request.headers.get("x-pos-sync-secret");

    if (!expectedSecret || receivedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    const body = (await request.json()) as {
      events?: Array<{
        eventId: string;
        type: string;
        aggregateType: string;
        aggregateId: string;
        payloadJson: string;
        createdAt: string;
      }>;
    };

    const result = await ctx.runMutation(api.sync.ingestEvents, {
      events: body.events ?? []
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  })
});

export default http;
