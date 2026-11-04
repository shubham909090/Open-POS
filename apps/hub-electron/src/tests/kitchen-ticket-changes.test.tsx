// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { KitchenView } from "../renderer/components/kitchen/kitchen-view.js";
import { hubApi, type Bootstrap, type KdsTicket } from "../renderer/hub-api.js";
import { useHubStore } from "../renderer/store.js";
vi.mock("../renderer/hub-api.js", () => ({ hubApi: { kds: vi.fn(), updateKotStatus: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("shows cancellations as explicit removal notices and acknowledges them with the existing served status", async () => {
  const tickets: KdsTicket[] = [
    { id: "cancel", type: "cancelled", sequence: 14, table_name: "R5", captain_id: "captain", status: "queued", items: [{ name_snapshot: "Butter naan", quantity_delta: -2 }] },
    { id: "partial", type: "partial_cancel", sequence: 15, table_name: "R6", captain_id: "captain", status: "queued", items: [{ name_snapshot: "Dal", quantity_delta: -1 }] },
  ];
  renderTickets(tickets);
  const cancelled = within(screen.getByText("Order cancelled").closest("article")!);
  const partial = within(screen.getByText("Items cancelled").closest("article")!);
  expect(cancelled.getByText("Remove 2 ×")).toBeTruthy();
  expect(partial.getByText("Remove 1 ×")).toBeTruthy();
  expect(cancelled.queryByRole("button", { name: /preparing|ready/i })).toBeNull();
  expect(partial.queryByRole("button", { name: /preparing|ready/i })).toBeNull();
  expect(screen.getByText("Order cancelled").closest("article")?.classList.contains("cancellation")).toBe(true);
  fireEvent.click(cancelled.getByRole("button", { name: "Acknowledge ticket 14 cancellation" }));
  await waitFor(() => expect(hubApi.updateKotStatus).toHaveBeenCalledWith("cancel", "served"));
});

it("distinguishes note-only updates and clears from preparation quantities, while mixed modifications retain preparation actions", () => {
  renderTickets([
    { id: "notes", type: "modified", sequence: 16, table_name: "R7", captain_id: "captain", status: "queued", items: [{ name_snapshot: "Soup", quantity_delta: 0, note_snapshot: "No chilli" }, { name_snapshot: "Rice", quantity_delta: 0, note_snapshot: null }] },
    { id: "mixed", type: "modified", sequence: 17, table_name: "R8", captain_id: "captain", status: "queued", items: [{ name_snapshot: "Naan", quantity_delta: 2 }, { name_snapshot: "Dal", quantity_delta: -1 }] },
  ]);
  const notes = within(screen.getByText("Soup").closest("article")!);
  expect(notes.getByText("Note updated")).toBeTruthy();
  expect(notes.getByText("Note cleared")).toBeTruthy();
  expect(notes.queryByRole("button", { name: /preparing|ready/i })).toBeNull();
  expect(notes.getByRole("button", { name: "Acknowledge ticket 16 changes" })).toBeTruthy();
  const mixed = within(screen.getByText("Naan").closest("article")!);
  expect(mixed.getByText("Add 2 ×")).toBeTruthy();
  expect(mixed.getByText("Remove 1 ×")).toBeTruthy();
  expect(mixed.getByRole("button", { name: "Mark ticket 17 preparing" })).toBeTruthy();
});

function renderTickets(tickets: KdsTicket[]) {
  useHubStore.setState({ selectedKdsUnitId: "kitchen" });
  vi.mocked(hubApi.kds).mockResolvedValue(tickets);
  vi.mocked(hubApi.updateKotStatus).mockResolvedValue(undefined as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(["kds", "kitchen"], tickets);
  const bootstrap = { setup: { kdsEnabled: true }, productionUnits: [{ id: "kitchen", name: "Kitchen", active: true, kds_enabled: true }] } as unknown as Bootstrap;
  return render(<QueryClientProvider client={client}><KitchenView bootstrap={bootstrap} setNotice={vi.fn()} /></QueryClientProvider>);
}
