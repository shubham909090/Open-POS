// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMobileHubRefresh } from "../hooks/use-mobile-hub-refresh";
import type { HubBootstrap, HubClient } from "../lib/hub-client";

vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("../lib/draft-store", () => ({ getHubUrl: vi.fn().mockResolvedValue("http://demo"), getDeviceToken: vi.fn().mockResolvedValue("demo-token") }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const bootstrap: HubBootstrap = { currentBusinessDay: { id: "day", business_date: "2026-11-04", period_start_at: "", period_end_at: "", status: "active" }, floors: [], tables: [], productionUnits: [], menuItems: [] };

it("drops an old hub's refresh result and runs the queued refresh with the latest client", async () => {
  let resolveOld!: (value: HubBootstrap) => void;
  const oldData = { ...bootstrap, currentBusinessDay: { ...bootstrap.currentBusinessDay, id: "old-hub" } };
  const oldClient = {
    bootstrap: vi.fn(() => new Promise<HubBootstrap>((resolve) => { resolveOld = resolve; })),
    me: vi.fn().mockResolvedValue({ name: "Old phone", role: "waiter" }),
    subscribeRealtime: vi.fn(() => vi.fn()), readyNotifications: vi.fn().mockResolvedValue([]),
  } as unknown as HubClient;
  const nextClient = {
    bootstrap: vi.fn().mockResolvedValue(bootstrap), me: vi.fn().mockResolvedValue({ name: "New phone", role: "waiter" }),
    subscribeRealtime: vi.fn(() => vi.fn()), readyNotifications: vi.fn().mockResolvedValue([]),
  } as unknown as HubClient;
  const publish = vi.fn(); const loadTableOrder = vi.fn().mockResolvedValue(undefined);
  const props: Parameters<typeof useMobileHubRefresh>[0] = {
    client: oldClient, initializing: false, hubUrl: "http://demo", deviceToken: "token", connection: "online", bootstrap: null,
    kitchenUnitId: "", selectedHistoryDayId: null, selectedTableId: "A", connectionFailuresRef: { current: 0 },
    hydrateDrafts: vi.fn(), loadTableOrder, notifyChime: vi.fn(), chimeForNewKdsTickets: vi.fn(),
    setInitializing: vi.fn(), setHubUrlState: vi.fn(), setDeviceTokenState: vi.fn(), setDeviceRoleState: vi.fn(), setDeviceNameState: vi.fn(),
    setConnection: vi.fn(), setLoading: vi.fn(), setMessage: vi.fn(), setBootstrap: publish, setCurrentOrder: vi.fn(),
    setCurrentSummary: vi.fn(), setDailyReports: vi.fn(), setSelectedHistoryDayId: vi.fn(), setSelectedHistoryDetail: vi.fn(), setKitchenUnitId: vi.fn(), setKdsTickets: vi.fn(),
  };
  const { rerender } = renderHook((input) => useMobileHubRefresh(input), { initialProps: props });
  rerender({ ...props, client: nextClient, selectedTableId: "B" });
  await act(async () => { resolveOld(oldData); });
  await waitFor(() => expect(loadTableOrder).toHaveBeenCalledWith("B"));
  expect(publish.mock.calls).toEqual([[bootstrap]]);
  expect(loadTableOrder).not.toHaveBeenCalledWith("A");
});
