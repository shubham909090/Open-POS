// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlcoholStoragePanel } from "../renderer/components/alcohol/alcohol-storage-panel.js";
import { hubApi, type AlcoholStorageRow } from "../renderer/hub-api.js";

const row: AlcoholStorageRow = {
  id: "whisky", name: "100 PIPERS", active: true, large_bottle_ml: 750, small_bottle_ml: 180,
  sealed_large_count: 0, open_large_ml: -1140, sealed_small_count: -16, total_available_ml: -4020,
  pending_large_ml: 0, pending_large_bottles: 0, pending_small_bottles: 0, pending_total_ml: 0, expected_after_settlement_ml: -4020
};

describe("liquor stock reset", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("requires an explicit Master PIN confirmation before resetting all balances", async () => {
    const approval = { pin: "9876", reason: "Physical stock reset", approvedBy: "owner" };
    const requestManagerApproval = vi.fn().mockResolvedValue(approval);
    const reset = vi.spyOn(hubApi, "resetAlcoholStock").mockResolvedValue({ resetCount: 1 });
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const setNotice = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><AlcoholStoragePanel rows={[row]} invalidate={invalidate} setNotice={setNotice} requestManagerApproval={requestManagerApproval} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Reset liquor stock" }));
    await waitFor(() => expect(reset).toHaveBeenCalledWith({ masterApproval: approval }));
    expect(requestManagerApproval).toHaveBeenCalledWith(expect.objectContaining({ pinLabel: "Master PIN", danger: true, confirmLabel: "Reset stock to zero" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(setNotice).toHaveBeenCalledWith({ tone: "good", text: "Liquor stock reset to zero for 1 item(s)." });
  });

  it("does not reset when the owner cancels confirmation", async () => {
    const reset = vi.spyOn(hubApi, "resetAlcoholStock");
    render(<QueryClientProvider client={new QueryClient()}><AlcoholStoragePanel rows={[row]} invalidate={vi.fn()} setNotice={vi.fn()} requestManagerApproval={vi.fn().mockRejectedValue(new Error("cancelled"))} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Reset liquor stock" }));
    await waitFor(() => expect(reset).not.toHaveBeenCalled());
  });
});
