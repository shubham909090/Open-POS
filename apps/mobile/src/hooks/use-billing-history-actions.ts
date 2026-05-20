import type { Dispatch, SetStateAction } from "react";

import type { DailyReportDetail, HubClient } from "../lib/hub-client";
import type { BillPrinterSlot } from "../lib/mobile-types";

export type HistoryEditPayloadItem =
  | { orderItemId?: string; menuItemId: string; menuItemVariantId?: string; quantity: number }
  | { orderItemId?: string; openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number };

type UseBillingHistoryActionsInput = {
  client: HubClient;
  deviceName: string;
  chooseBillPrinter: (title: string) => Promise<BillPrinterSlot | null>;
  operationKey: (prefix: string, scope: unknown) => string;
  clearOperationKey: (prefix: string, scope: unknown) => void;
  refresh: (showSpinner?: boolean) => Promise<void>;
  selectedHistoryDayId: string | null;
  setSelectedHistoryDayId: Dispatch<SetStateAction<string | null>>;
  setSelectedHistoryDetail: Dispatch<SetStateAction<DailyReportDetail | null>>;
  setSending: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string>>;
};

export function useBillingHistoryActions({
  client,
  deviceName,
  chooseBillPrinter,
  operationKey,
  clearOperationKey,
  refresh,
  selectedHistoryDayId,
  setSelectedHistoryDayId,
  setSelectedHistoryDetail,
  setSending,
  setMessage,
}: UseBillingHistoryActionsInput) {
  async function printHistoryBill(billId: string) {
    try {
      setSending(true);
      const printerSlot = await chooseBillPrinter("Print bill where?");
      if (!printerSlot) return;
      const scope = { billId, printerSlot };
      await client.historyReprintBill(billId, { idempotencyKey: operationKey("mobile-history-reprint", scope), printerSlot });
      clearOperationKey("mobile-history-reprint", scope);
      setMessage("History bill print queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not print history bill.");
    } finally {
      setSending(false);
    }
  }

  async function editHistoryBill(billId: string, items: HistoryEditPayloadItem[], masterPin: string): Promise<boolean> {
    try {
      setSending(true);
      const printerSlot = await chooseBillPrinter("Print edited bill where?");
      if (!printerSlot) return false;
      const payload = {
        masterApproval: { pin: masterPin, reason: "Owner history edit", approvedBy: deviceName || "owner" },
        items
      };
      const scope = { billId, payload, printerSlot };
      await client.historyEditBill(billId, payload, { idempotencyKey: operationKey("mobile-history-edit", scope), printerSlot });
      clearOperationKey("mobile-history-edit", scope);
      await refresh(false);
      if (selectedHistoryDayId) setSelectedHistoryDetail(await client.dailyReport(selectedHistoryDayId));
      setMessage("History bill edited and updated bill print queued.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not edit history bill.");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function selectHistoryDay(posDayId: string | null) {
    setSelectedHistoryDayId(posDayId);
    if (!posDayId) {
      setSelectedHistoryDetail(null);
      return;
    }
    try {
      setSending(true);
      setSelectedHistoryDetail(await client.dailyReport(posDayId));
    } catch (error) {
      setSelectedHistoryDetail(null);
      setMessage(error instanceof Error ? error.message : "Could not load order history for that day.");
    } finally {
      setSending(false);
    }
  }

  return { printHistoryBill, editHistoryBill, selectHistoryDay };
}
