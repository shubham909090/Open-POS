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
    const installationId = request.headers.get("x-pos-installation-id") ?? undefined;
    const installationSecret = request.headers.get("x-pos-installation-secret") ?? receivedSecret ?? undefined;

    if (!installationId && (!expectedSecret || receivedSecret !== expectedSecret)) {
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

    let result: { inserted: number };
    try {
      result = await ctx.runMutation(api.sync.ingestEvents, {
        installationId,
        syncSecret: installationSecret,
        events: body.events ?? []
      });
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  })
});

http.route({
  path: "/pos/pull-hub-snapshot",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const receivedSecret = request.headers.get("x-pos-sync-secret");
    const installationId = request.headers.get("x-pos-installation-id");
    const installationSecret = request.headers.get("x-pos-installation-secret") ?? receivedSecret;

    if (!installationId || !installationSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    const body = (await request.json().catch(() => ({}))) as { cursor?: string };
    let result: {
      cursor: string;
      commands: Array<{ commandId: string; type: string; payloadJson: string; createdAt: string }>;
    };
    try {
      result = await ctx.runMutation(api.sync.pullHubSnapshot, {
        installationId,
        syncSecret: installationSecret,
        cursor: body.cursor
      });
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  })
});

export default http;
