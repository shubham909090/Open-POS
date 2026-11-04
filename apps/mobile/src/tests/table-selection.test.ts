import { describe, expect, it, vi } from "vitest";
import type { DraftOrder } from "../lib/draft-store";
import type { HubOrder } from "../lib/hub-client";
import { createTableSelection, loadSelectedTableOrder, restoreSelectedDraft } from "../lib/table-selection";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

const order = (tableId: string): HubOrder => ({ order: { id: `order-${tableId}`, table_id: tableId, status: "open", pax: 2 }, items: [], bill: null });
const draft = (tableId: string): DraftOrder => ({ tableId, items: [{ menuItemId: `dish-${tableId}`, quantity: 1 }], pax: 2, updatedAt: "2026-11-04T00:00:00Z" });

describe("table selection response ownership", () => {
  it("does not restore A's draft after B was selected and restored", async () => {
    const scope = createTableSelection({});
    const pendingA = deferred<DraftOrder | null>();
    const pendingB = deferred<DraftOrder | null>();
    const apply = vi.fn();
    const a = restoreSelectedDraft(scope, scope.select("A"), () => pendingA.promise, apply);
    const b = restoreSelectedDraft(scope, scope.select("B"), () => pendingB.promise, apply);
    pendingB.resolve(draft("B")); await b;
    pendingA.resolve(draft("A")); await a;
    expect(apply.mock.calls).toEqual([[draft("B")]]);
  });

  it("publishes only B when A's order arrives late, including A's later failure", async () => {
    const pendingA = deferred<HubOrder | null>();
    const pendingB = deferred<HubOrder | null>();
    const client = { tableOrder: vi.fn((tableId: string) => tableId === "A" ? pendingA.promise : pendingB.promise) };
    const scope = createTableSelection(client);
    const apply = vi.fn(); const error = vi.fn();
    scope.select("A"); const a = loadSelectedTableOrder(scope, client, "A", apply, error);
    scope.select("B"); const b = loadSelectedTableOrder(scope, client, "B", apply, error);
    pendingB.resolve(order("B")); await b;
    pendingA.reject(new Error("old A failure")); await a;
    expect(apply.mock.calls).toEqual([[order("B")]]);
    expect(error).not.toHaveBeenCalled();
  });

  it("rejects stale A responses after A → B → A and callbacks using an old hub client", async () => {
    const oldResponse = deferred<HubOrder | null>();
    const oldClient = { tableOrder: vi.fn(() => oldResponse.promise) };
    const nextClient = { tableOrder: vi.fn().mockResolvedValue(order("A")) };
    const scope = createTableSelection(oldClient);
    const apply = vi.fn(); const error = vi.fn();
    scope.select("A");
    const pending = loadSelectedTableOrder(scope, oldClient, "A", apply, error);
    scope.select("B"); scope.select("A");
    scope.setClient(nextClient); scope.select("A");
    await loadSelectedTableOrder(scope, nextClient, "A", apply, error);
    await loadSelectedTableOrder(scope, oldClient, "A", apply, error);
    oldResponse.resolve(order("A")); await pending;
    expect(oldClient.tableOrder).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls).toEqual([[order("A")]]);
  });

  it("rejects a server order belonging to a different table", async () => {
    const client = { tableOrder: vi.fn().mockResolvedValue(order("A")) };
    const scope = createTableSelection(client); scope.select("B");
    const apply = vi.fn(); const error = vi.fn();
    await loadSelectedTableOrder(scope, client, "B", apply, error);
    expect(apply).toHaveBeenCalledWith(null);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("another table"));
  });
});
