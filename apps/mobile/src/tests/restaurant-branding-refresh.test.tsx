// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { RestaurantBranding } from "@gaurav-pos/shared";
import { useRestaurantBranding } from "../hooks/use-restaurant-branding";

vi.mock("../hooks/use-payment-qr", () => ({ pickImageDataUrl: vi.fn() }));
vi.mock("../lib/restaurant-branding-cache", () => ({
  readRestaurantBrandingCache: vi.fn(async () => null),
  writeRestaurantBrandingCache: vi.fn(async () => {})
}));
vi.mock("../../modules/restaurant-shortcut", () => ({ updateRestaurantShortcut: vi.fn(async () => true) }));
afterEach(cleanup);

it("keeps a successful branding save when an older refresh finishes later", async () => {
  const saved: RestaurantBranding = { restaurantName: "New name", logoImageDataUrl: null, updatedAt: "2026-11-09T10:00:00.000Z" };
  let finishRefresh!: (value: { branding: RestaurantBranding }) => void;
  const pending = new Promise<{ branding: RestaurantBranding }>((resolve) => { finishRefresh = resolve; });
  const client = {
    restaurantBranding: vi.fn(() => pending),
    subscribeRealtime: vi.fn(() => () => {}),
    updateRestaurantBranding: vi.fn(async () => ({ branding: saved }))
  };
  const { result } = renderHook(() => useRestaurantBranding({ client: client as never, hubUrl: "http://demo", online: true, deviceName: "Captain" }));
  await act(async () => { await result.current.save({ restaurantName: saved.restaurantName }, "9876"); });
  expect(result.current.branding).toEqual(saved);
  await act(async () => { finishRefresh({ branding: { ...saved, restaurantName: "Old name", updatedAt: "2026-11-09T09:00:00.000Z" } }); });
  expect(result.current.branding).toEqual(saved);
});
