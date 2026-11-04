// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PaymentQr } from "@gaurav-pos/shared";
import type { HubClient } from "../lib/hub-client";
import { usePaymentQr } from "../hooks/use-payment-qr";

vi.mock("react-native", () => ({ AppState: { currentState: "active", addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock("expo-file-system", () => ({ Directory: {}, File: class {}, Paths: {} }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn() }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

const qr: PaymentQr = { imageDataUrl: "data:image/png;base64,AAAA", upiUri: "upi://pay?pa=demo@upi", sizeMm: 32, updatedAt: "2026-11-04T00:00:00Z", upiId: "demo@upi", payeeName: "Demo" };

it("keeps a failed protected save visible through healthy background refreshes until the edit is dismissed", async () => {
  vi.useFakeTimers();
  const client = {
    paymentQr: vi.fn().mockResolvedValue({ qr }),
    removePaymentQr: vi.fn().mockRejectedValue(new Error("Master PIN is incorrect")),
    subscribeRealtime: vi.fn(() => vi.fn()),
  } as unknown as HubClient;
  const { result } = renderHook(() => usePaymentQr({ client, online: true, deviceName: "Captain" }));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.qr).toEqual(qr);
  act(() => result.current.setChange({ kind: "remove", expectedUpdatedAt: qr.updatedAt }));
  await act(async () => { await result.current.saveChange("0000"); });
  expect(result.current.error).toBe("Master PIN is incorrect");
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(result.current.qr).toEqual(qr);
  expect(result.current.error).toBe("Master PIN is incorrect");
  await act(async () => { await result.current.refresh(true); });
  expect(result.current.error).toBe("Master PIN is incorrect");
  act(() => result.current.setChange(null));
  expect(result.current.error).toBe("");
});

it("clears a connection-load error when the current QR can be fetched again", async () => {
  const paymentQr = vi.fn().mockRejectedValueOnce(new Error("Hub disconnected")).mockResolvedValue({ qr });
  const client = { paymentQr, subscribeRealtime: vi.fn(() => vi.fn()) } as unknown as HubClient;
  const { result } = renderHook(() => usePaymentQr({ client, online: true, deviceName: "Captain" }));
  await waitFor(() => expect(result.current.error).toBe("Hub disconnected"));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.error).toBe("");
  expect(result.current.qr).toEqual(qr);
});
