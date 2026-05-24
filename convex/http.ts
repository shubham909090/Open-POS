import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { isBackupDomain, type BackupBatchRow } from "./backupModel";

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

    await request.json().catch(() => ({}));
    return jsonResponse({ inserted: 0, deprecated: true }, 200);
  })
});

http.route({
  path: "/pos/activate-license",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = (await request.json()) as { setupKey?: string; hubFingerprint?: string; hubLabel?: string };
      if (!body.setupKey || !body.hubFingerprint) return jsonResponse({ error: "Setup key and hub fingerprint are required" }, 400);
      const result = await ctx.runMutation(internal.license.activateSetupKey, {
        setupKey: body.setupKey,
        hubFingerprint: body.hubFingerprint,
        hubLabel: body.hubLabel
      });
      return jsonResponse(result, 200);
    } catch (error) {
      return syncErrorResponse(error);
    }
  })
});

http.route({
  path: "/pos/license-check",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const installationId = request.headers.get("x-pos-installation-id") ?? undefined;
    const syncSecret = request.headers.get("x-pos-installation-secret") ?? request.headers.get("x-pos-sync-secret") ?? undefined;
    if (!installationId || !syncSecret) return jsonResponse({ error: "Unauthorized" }, 401);
    try {
      const body = (await request.json().catch(() => ({}))) as { hubFingerprint?: string };
      const result = await ctx.runMutation(internal.license.checkLicense, {
        installationId,
        syncSecret,
        hubFingerprint: body.hubFingerprint
      });
      return jsonResponse(result, 200);
    } catch (error) {
      return syncErrorResponse(error);
    }
  })
});

http.route({
  path: "/pos/backup/push",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const installationId = request.headers.get("x-pos-installation-id") ?? undefined;
    const syncSecret = request.headers.get("x-pos-installation-secret") ?? request.headers.get("x-pos-sync-secret") ?? undefined;
    if (!installationId || !syncSecret) return jsonResponse({ error: "Unauthorized" }, 401);
    try {
      const body = (await request.json()) as { rows?: unknown[] };
      const result = await ctx.runMutation(internal.backup.pushBackupBatch, {
        installationId,
        syncSecret,
        rows: (Array.isArray(body.rows) ? body.rows : []) as BackupBatchRow[]
      });
      return jsonResponse(result, 200);
    } catch (error) {
      return syncErrorResponse(error);
    }
  })
});

http.route({
  path: "/pos/backup/manifest",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const installationId = request.headers.get("x-pos-installation-id") ?? undefined;
    const syncSecret = request.headers.get("x-pos-installation-secret") ?? request.headers.get("x-pos-sync-secret") ?? undefined;
    if (!installationId || !syncSecret) return jsonResponse({ error: "Unauthorized" }, 401);
    try {
      const result = await ctx.runMutation(internal.backup.manifest, { installationId, syncSecret });
      return jsonResponse(result, 200);
    } catch (error) {
      return syncErrorResponse(error);
    }
  })
});

http.route({
  path: "/pos/backup/restore-page",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const installationId = request.headers.get("x-pos-installation-id") ?? undefined;
    const syncSecret = request.headers.get("x-pos-installation-secret") ?? request.headers.get("x-pos-sync-secret") ?? undefined;
    if (!installationId || !syncSecret) return jsonResponse({ error: "Unauthorized" }, 401);
    try {
      const body = (await request.json()) as {
        domain?: string;
        throughBusinessDate?: string;
        cursor?: string;
        limit?: number;
      };
      if (!body.domain || !isBackupDomain(body.domain)) return jsonResponse({ error: "Valid backup domain is required" }, 400);
      const result = await ctx.runMutation(internal.backup.pullRestorePage, {
        installationId,
        syncSecret,
        domain: body.domain,
        throughBusinessDate: body.throughBusinessDate,
        cursor: body.cursor,
        limit: body.limit
      });
      return jsonResponse(result, 200);
    } catch (error) {
      return syncErrorResponse(error);
    }
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

    const body = (await request.json().catch(() => ({}))) as { cursor?: string };
    return jsonResponse({ cursor: body.cursor ?? "", commands: [], deprecated: true }, 200);
  })
});

export default http;
