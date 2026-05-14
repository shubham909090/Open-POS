import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function syncErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected sync error";
  if (message.toLowerCase().includes("unauthorized")) return jsonResponse({ error: "Unauthorized" }, 401);
  if (
    message.toLowerCase().includes("required") ||
    message.toLowerCase().includes("must be") ||
    message.toLowerCase().includes("too many") ||
    message.toLowerCase().includes("json")
  ) {
    return jsonResponse({ error: message }, 400);
  }
  return jsonResponse({ error: "Sync server error" }, 500);
}

http.route({
  path: "/pos/ingest-events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const receivedSecret = request.headers.get("x-pos-sync-secret");
    const installationId = request.headers.get("x-pos-installation-id") ?? undefined;
    const installationSecret = request.headers.get("x-pos-installation-secret") ?? receivedSecret ?? undefined;

    if (!installationId || !installationSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let result: { inserted: number };
    try {
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
      result = await ctx.runMutation(internal.sync.ingestEvents, {
        installationId,
        syncSecret: installationSecret,
        events: body.events ?? []
      });
    } catch (error) {
      return syncErrorResponse(error);
    }

    return jsonResponse(result, 200);
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
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let result: {
      cursor: string;
      commands: Array<{ commandId: string; type: string; payloadJson: string; createdAt: string }>;
    };
    try {
      const body = (await request.json().catch(() => ({}))) as { cursor?: string };
      result = await ctx.runMutation(internal.sync.pullHubSnapshot, {
        installationId,
        syncSecret: installationSecret,
        cursor: body.cursor
      });
    } catch (error) {
      return syncErrorResponse(error);
    }

    return jsonResponse(result, 200);
  })
});

export default http;
