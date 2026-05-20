import type { Dispatch, SetStateAction } from "react";
import { Alert } from "react-native";
import type { OrderItemInput } from "@gaurav-pos/shared";

import type { HubBootstrap, HubClient, HubOrder, RequestOptions } from "../lib/hub-client";
import { approvalPayload, normalisePax } from "../lib/mobile-format";
import type { ConnectionState, MobileOrderStateItem, OrderStateSaveMode, PaymentMethod, PrintMode, ViewMode } from "../lib/mobile-types";
import { buildBillRevisionItems, buildDraftOrderSummary } from "../lib/order-command-builders";

type TableServiceActionsInput = {
  client: HubClient;
  connection: ConnectionState;
  currentOrder: HubOrder | null;
  deviceName: string;
  hasNewItems: boolean;
  items: OrderItemInput[];
  menuItems: HubBootstrap["menuItems"];
  operationKey: (name: string, scope?: unknown) => string;
  clearOperationKey: (name: string, scope?: unknown) => void;
  pax: string;
  persistDraft: (nextItems?: OrderItemInput[], nextPax?: string) => Promise<void>;
  clearSelectedTableDraft: () => Promise<void>;
  refresh: (showSpinner?: boolean) => Promise<void>;
  loadTableOrder: (tableId: string) => Promise<void>;
  chooseBillPrinter: (title: string) => Promise<RequestOptions["printerSlot"] | null>;
  selectedTableId: string | null;
  sentItems: HubOrder["items"];
  sending: boolean;
  setMessage: Dispatch<SetStateAction<string>>;
  setMode: Dispatch<SetStateAction<ViewMode>>;
  setSelectedTableId: Dispatch<SetStateAction<string | null>>;
  setSending: Dispatch<SetStateAction<boolean>>;
};

export function useTableServiceActions({
  client,
  connection,
  currentOrder,
  deviceName,
  hasNewItems,
  items,
  menuItems,
  operationKey,
  clearOperationKey,
  pax,
  persistDraft,
  clearSelectedTableDraft,
  refresh,
  loadTableOrder,
  chooseBillPrinter,
  selectedTableId,
  sentItems,
  sending,
  setMessage,
  setMode,
  setSelectedTableId,
  setSending,
}: TableServiceActionsInput) {
  function orderSummary() {
    return buildDraftOrderSummary(items, menuItems);
  }

  function confirmSendKot(printMode: PrintMode): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(printMode === "kot" ? "Save KOT?" : "Print and KOT?", orderSummary(), [
        { text: "Review", style: "cancel", onPress: () => resolve(false) },
        { text: printMode === "kot" ? "KOT" : "Print and KOT", onPress: () => resolve(true) }
      ]);
    });
  }

  async function submitOrder(printMode: PrintMode) {
    if (sending) return;
    if (!selectedTableId) {
      setMessage("Choose a table first.");
      setMode("tables");
      return;
    }
    if (!hasNewItems) {
      setMessage("Add at least one dish before sending.");
      setMode("menu");
      return;
    }
    if (connection !== "online") {
      await persistDraft();
      Alert.alert("Draft saved", "Reconnect to the hub to send these items.");
      return;
    }
    if (!(await confirmSendKot(printMode))) return;

    try {
      setSending(true);
      const input = {
        tableId: selectedTableId,
        pax: normalisePax(pax),
        orderType: "dine_in" as const,
        printMode,
        items
      };
      const scope = { tableId: selectedTableId, items, pax: normalisePax(pax), printMode };
      await client.submitOrder(input, { idempotencyKey: operationKey("mobile-order", scope) });
      clearOperationKey("mobile-order", scope);
      await clearSelectedTableDraft();
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMode("ticket");
      setMessage(printMode === "kot" ? "KOT saved. New items are cleared; sent items stay on the table check." : "Print and KOT sent. New items are cleared; sent items stay on the table check.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send order.");
    } finally {
      setSending(false);
    }
  }

  async function shiftTable(toTableId: string) {
    if (!selectedTableId) {
      setMessage("Choose a running table before shifting.");
      return;
    }
    if (connection !== "online") {
      setMessage("Reconnect to the hub before shifting a table.");
      return;
    }
    try {
      setSending(true);
      await client.moveTable({
        fromTableId: selectedTableId,
        toTableId,
        reason: "Shifted from captain app"
      });
      await refresh(false);
      setSelectedTableId(toTableId);
      await loadTableOrder(toTableId);
      setMode("ticket");
      setMessage("Table transferred. Source and target checks have been refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not shift table.");
    } finally {
      setSending(false);
    }
  }

  async function shiftItem(orderItemId: string, quantity: number, toTableId: string) {
    if (!selectedTableId) {
      setMessage("Choose a running table before shifting an item.");
      return;
    }
    if (connection !== "online") {
      setMessage("Reconnect to the hub before shifting items.");
      return;
    }
    try {
      setSending(true);
      await client.moveItems({
        fromTableId: selectedTableId,
        toTableId,
        reason: "Items shifted from captain app",
        items: [{ orderItemId, quantity }]
      });
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage("Item quantity transferred. The table checks have been refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not shift item.");
    } finally {
      setSending(false);
    }
  }

  async function generateBillForSelectedTable() {
    if (!currentOrder?.order || !selectedTableId) {
      setMessage("Send items first, then generate the bill.");
      return;
    }
    try {
      setSending(true);
      const printerSlot = await chooseBillPrinter("Print bill where?");
      if (!printerSlot) return;
      const scope = { orderId: currentOrder.order.id, printerSlot };
      await client.generateBill(currentOrder.order.id, { idempotencyKey: operationKey("mobile-bill-generate", scope), printerSlot });
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage("Bill generated and print queued for this table.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate bill.");
    } finally {
      setSending(false);
    }
  }

  async function saveOrderStateForSelectedTable(
    saveMode: OrderStateSaveMode,
    stateItems: MobileOrderStateItem[],
    managerApproval?: { pin: string; reason: string }
  ) {
    if (!currentOrder?.order || !selectedTableId) {
      setMessage("Choose a running or billed table first.");
      return;
    }
    try {
      setSending(true);
      const approval = managerApproval ? approvalPayload(managerApproval.pin, managerApproval.reason, deviceName).managerApproval : undefined;
      const scope = { orderId: currentOrder.order.id, saveMode, stateItems, approval };
      await client.updateOrderState(
        currentOrder.order.id,
        { saveMode, items: stateItems, ...(approval ? { managerApproval: approval } : {}) },
        { idempotencyKey: operationKey("mobile-order-state", scope) }
      );
      clearOperationKey("mobile-order-state", scope);
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage(saveMode === "save" ? "Table state saved. No KDS or print update was sent." : "Table state saved and modification tickets were sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save table state.");
    } finally {
      setSending(false);
    }
  }

  async function reprintSelectedBill(pin: string, reason: string) {
    if (!currentOrder?.bill) {
      setMessage("Generate the bill before reprinting.");
      return;
    }
    try {
      setSending(true);
      const printerSlot = await chooseBillPrinter("Reprint bill where?");
      if (!printerSlot) return;
      const payload = approvalPayload(pin, reason, deviceName);
      const scope = { billId: currentOrder.bill.id, payload, printerSlot };
      await client.reprintBill(currentOrder.bill.id, payload, { idempotencyKey: operationKey("mobile-bill-reprint", scope), printerSlot });
      clearOperationKey("mobile-bill-reprint", scope);
      setMessage("Bill reprint queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reprint bill.");
    } finally {
      setSending(false);
    }
  }

  async function markSelectedBillNc(pin: string, reason: string) {
    if (!currentOrder?.bill || !selectedTableId) {
      setMessage("Generate the bill before marking NC.");
      return;
    }
    try {
      setSending(true);
      const printerSlot = await chooseBillPrinter("Print NC bill where?");
      if (!printerSlot) return;
      const payload = approvalPayload(pin, reason, deviceName);
      const scope = { billId: currentOrder.bill.id, payload, printerSlot };
      await client.markBillNc(currentOrder.bill.id, payload, { idempotencyKey: operationKey("mobile-bill-nc", scope), printerSlot });
      clearOperationKey("mobile-bill-nc", scope);
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage("NC bill saved and print queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark NC bill.");
    } finally {
      setSending(false);
    }
  }

  async function settleSelectedBill(input: {
    discountType: "amount" | "percent";
    discountValue: number;
    tipPaise: number;
    payments: Array<{ method: PaymentMethod; amountPaise: number; reference?: string }>;
  }) {
    if (!currentOrder?.bill || !selectedTableId) {
      setMessage("Generate the bill before taking payment.");
      return;
    }
    try {
      setSending(true);
      const scope = { billId: currentOrder.bill.id, existingPaid: currentOrder.bill.paid_paise ?? 0, input };
      await client.settleBill(currentOrder.bill.id, input, { idempotencyKey: operationKey("mobile-bill-settle", scope) });
      clearOperationKey("mobile-bill-settle", scope);
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage("Payment saved. Table status has been refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not punch bill.");
    } finally {
      setSending(false);
    }
  }

  async function reviseSelectedBill(pin: string, reason: string) {
    if (!currentOrder?.bill || !selectedTableId) {
      setMessage("Generate the bill before revising.");
      return;
    }
    if (!items.length && !sentItems.length) {
      setMessage("Add new dishes before revising this bill.");
      return;
    }
    try {
      setSending(true);
      const payload = {
        ...approvalPayload(pin, reason, deviceName),
        items: buildBillRevisionItems(sentItems, items)
      };
      const scope = { billId: currentOrder.bill.id, payload };
      await client.reviseBill(currentOrder.bill.id, payload, { idempotencyKey: operationKey("mobile-bill-revise", scope) });
      clearOperationKey("mobile-bill-revise", scope);
      await clearSelectedTableDraft();
      await refresh(false);
      await loadTableOrder(selectedTableId);
      setMessage("Bill revised. Latest bill is ready for payment or print.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revise bill.");
    } finally {
      setSending(false);
    }
  }

  return {
    submitOrder,
    shiftTable,
    shiftItem,
    generateBillForSelectedTable,
    saveOrderStateForSelectedTable,
    reprintSelectedBill,
    markSelectedBillNc,
    settleSelectedBill,
    reviseSelectedBill,
  };
}
