import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { HubDatabase } from "../db/database.js";
import { idempotencyRecords } from "../db/drizzle-schema.js";
import { DomainError } from "../domain/errors.js";
import type { HeaderRequest } from "./route-context.js";

export type IdempotencyRequest = HeaderRequest & {
  body?: unknown;
};

export type WithIdempotency = <T>(
  request: IdempotencyRequest,
  route: string,
  handler: () => T
) => Promise<{ result: T; replayed: boolean }>;

export function createIdempotencyHandler(database: HubDatabase): WithIdempotency {
  return async <T>(request: IdempotencyRequest, route: string, handler: () => T) => {
    const rawKey = request.headers["idempotency-key"];
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    if (!key) return { result: handler(), replayed: false };
    const requestHash = createHash("sha256").update(JSON.stringify(request.body ?? null)).digest("hex");

    const existing = database.orm
      .select({
        requestHash: idempotencyRecords.requestHash,
        responseJson: idempotencyRecords.responseJson,
        status: idempotencyRecords.status
      })
      .from(idempotencyRecords)
      .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.route, route)))
      .get();
    if (existing && existing.requestHash !== requestHash) {
      throw new DomainError("Idempotency key was already used with a different request body", 409);
    }
    if (existing?.status === "completed") return { result: JSON.parse(existing.responseJson) as T, replayed: true };
    if (existing?.status === "in_progress") throw new DomainError("Request is already in progress. Retry shortly.", 409);

    const now = new Date().toISOString();
    if (existing?.status === "failed") {
      database.orm
        .update(idempotencyRecords)
        .set({ status: "in_progress", responseJson: "", updatedAt: now })
        .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.route, route)))
        .run();
    } else {
      try {
        database.orm
          .insert(idempotencyRecords)
          .values({ key, route, requestHash, status: "in_progress", responseJson: "", createdAt: now, updatedAt: now })
          .run();
      } catch {
        throw new DomainError("Request is already in progress. Retry shortly.", 409);
      }
    }

    try {
      const result = handler();
      database.orm
        .update(idempotencyRecords)
        .set({ status: "completed", responseJson: JSON.stringify(result), updatedAt: new Date().toISOString() })
        .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.route, route)))
        .run();
      return { result, replayed: false };
    } catch (error) {
      database.orm
        .update(idempotencyRecords)
        .set({ status: "failed", updatedAt: new Date().toISOString() })
        .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.route, route)))
        .run();
      throw error;
    }
  };
}
