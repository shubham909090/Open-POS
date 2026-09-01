import { describe, expect, it, vi } from "vitest";
import { useBillingHistoryActions } from "../hooks/use-billing-history-actions";
import type { HubClient } from "../lib/hub-client";

describe("billing history actions", () => {
  it("saves history bill edits without asking for a printer when save-only is requested", async () => {
    const historyEditBill = vi.fn().mockResolvedValue({ billId: "bill-1", revisionNumber: 2, totalPaise: 36_000, printJobIds: [], modified: true });
    const client = { historyEditBill, dailyReport: vi.fn() } as unknown as HubClient;
    const chooseBillPrinter = vi.fn();
    const operationKey = vi.fn((prefix: string) => `${prefix}-key`);
    const clearOperationKey = vi.fn();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const setSending = vi.fn();
    const setMessage = vi.fn();

    const actions = useBillingHistoryActions({
      client,
      deviceName: "Owner Phone",
      chooseBillPrinter,
      operationKey,
      clearOperationKey,
      refresh,
      selectedHistoryDayId: null,
      setSelectedHistoryDayId: vi.fn(),
      setSelectedHistoryDetail: vi.fn(),
      setSending,
      setMessage,
    });

    const saved = await actions.editHistoryBill("bill-1", [{ menuItemId: "item-dal-fry", quantity: 2 }], "  Sharma Family  ", "9876", "save");

    expect(saved).toBe(true);
    expect(chooseBillPrinter).not.toHaveBeenCalled();
    expect(historyEditBill).toHaveBeenCalledWith(
      "bill-1",
      {
        saveMode: "save",
        customerName: "Sharma Family",
        masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "Owner Phone" },
        items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
      },
      { idempotencyKey: "mobile-history-edit-key" }
    );
    expect(clearOperationKey).toHaveBeenCalledWith(
      "mobile-history-edit",
      expect.objectContaining({ billId: "bill-1", printerSlot: "default" })
    );
    expect(refresh).toHaveBeenCalledWith(false);
    expect(setMessage).toHaveBeenLastCalledWith("History bill edited.");
    expect(setSending).toHaveBeenNthCalledWith(1, true);
    expect(setSending).toHaveBeenLastCalledWith(false);
  });
});
