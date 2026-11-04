// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useOrderDraft } from "../hooks/use-order-draft";
import { loadDraft, saveDraft } from "../lib/draft-store";
import type { DraftOrder } from "../lib/draft-store";
import type { HubClient, HubOrder } from "../lib/hub-client";

vi.mock("../lib/draft-store", () => ({ loadDraft: vi.fn(), saveDraft: vi.fn().mockResolvedValue(undefined), clearDraft: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const draft = (id: string): DraftOrder => ({ tableId: id, pax: 3, items: [{ menuItemId: `dish-${id}`, quantity: 1 }], updatedAt: "now" });
const order = (id: string): HubOrder => ({ order: { id: `order-${id}`, table_id: id, status: "open", pax: 3 }, items: [], bill: null });

it("clears A immediately while B hydrates and never saves or publishes A data for B", async () => {
  const draftA = deferred<DraftOrder | null>(); const draftB = deferred<DraftOrder | null>();
  const orderA = deferred<HubOrder | null>(); const orderB = deferred<HubOrder | null>();
  vi.mocked(loadDraft).mockImplementation((id) => id === "A" ? draftA.promise : draftB.promise);
  const client = { tableOrder: vi.fn((id: string) => id === "A" ? orderA.promise : orderB.promise) } as unknown as HubClient;
  const publish = vi.fn();
  const { result } = renderHook(() => useOrderDraft({ client, connection: "online", setCurrentOrder: publish, setMessage: vi.fn(), setMode: vi.fn() }));
  let a!: Promise<void>; let b!: Promise<void>;
  act(() => { a = result.current.selectTable("A"); });
  await act(async () => { draftA.resolve(draft("A")); });
  expect(result.current.items).toEqual(draft("A").items);
  const stalePersist = result.current.persistDraft;
  act(() => { b = result.current.selectTable("B"); });
  expect(result.current.items).toEqual([]);
  expect(result.current.draftLoading).toBe(true);
  await act(async () => { await stalePersist(); result.current.addItem("too-early"); });
  expect(saveDraft).not.toHaveBeenCalled();
  await act(async () => { draftB.resolve(draft("B")); orderB.resolve(order("B")); await b; });
  await act(async () => { orderA.resolve(order("A")); await a; });
  expect(result.current.selectedTableId).toBe("B");
  expect(result.current.items).toEqual(draft("B").items);
  expect(publish.mock.calls.filter(([value]) => value !== null)).toEqual([[order("B")]]);
  act(() => { result.current.addItem("new-B"); });
  expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ tableId: "B", items: [{ menuItemId: "dish-B", quantity: 1 }, { menuItemId: "new-B", quantity: 1 }] }));
});

it("invalidates pending draft and order work when the hub client changes", async () => {
  const oldDraft = deferred<DraftOrder | null>();
  vi.mocked(loadDraft).mockReturnValue(oldDraft.promise);
  const oldClient = { tableOrder: vi.fn().mockResolvedValue(order("A")) } as unknown as HubClient;
  const nextClient = { tableOrder: vi.fn() } as unknown as HubClient;
  const publish = vi.fn();
  const { result, rerender } = renderHook(({ client }) => useOrderDraft({ client, connection: "online", setCurrentOrder: publish, setMessage: vi.fn(), setMode: vi.fn() }), { initialProps: { client: oldClient } });
  let pending!: Promise<void>;
  act(() => { pending = result.current.selectTable("A"); });
  const oldLoad = result.current.loadTableOrder;
  rerender({ client: nextClient });
  await act(async () => { oldDraft.resolve(draft("A")); await pending; await oldLoad("A"); });
  expect(result.current.selectedTableId).toBeNull();
  expect(result.current.items).toEqual([]);
  expect(result.current.draftLoading).toBe(false);
  expect(oldClient.tableOrder).not.toHaveBeenCalled();
  expect(publish.mock.calls.filter(([value]) => value !== null)).toEqual([]);
});
