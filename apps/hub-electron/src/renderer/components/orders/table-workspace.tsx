import { formatInr, getOrderStateSignature, isTransferTargetTable, searchMenuItems } from "@gaurav-pos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { hubApi, type BillAdjustmentPayload, type BillPrinterSlot, type Bootstrap, type MenuItem } from "../../hub-api.js";
import { menuItemVariantOptions, messageOf, type NoticeSetter } from "../../lib/format.js";
import type { ManagerApproval, ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { useOperationKeys } from "../../hooks/use-operation-keys.js";
import { useHubStore } from "../../store.js";
import { EmptyState } from "../ui/empty-state.js";
import { ConfirmationDialog } from "../ui/confirmation-dialog.js";
import { BillingPanel } from "./billing-panel.js";
import { BillPrinterChooser } from "./bill-printer-chooser.js";
import { NewOrderPanel } from "./new-order-panel.js";
import type { SaveMode, StateItem } from "./order-workspace-types.js";
import { SentOrderPanel } from "./sent-order-panel.js";

export type { SaveMode, StateItem } from "./order-workspace-types.js";

export function TableWorkspace({
  tableId,
  tableName,
  bootstrap,
  setNotice,
  requestManagerApproval,
  onClose
}: {
  tableId: string | null;
  tableName: string;
  bootstrap: Bootstrap;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onClose?: () => void;
}) {
  const queryClient = useQueryClient();
  const orderPanel = useHubStore((state) => state.orderPanel);
  const setOrderPanel = useHubStore((state) => state.setOrderPanel);
  const selectTable = useHubStore((state) => state.selectTable);
  const drafts = useHubStore((state) => state.drafts);
  const clearDraft = useHubStore((state) => state.clearDraft);
  const [shiftTargetTableId, setShiftTargetTableId] = useState("");
  const [transferMode, setTransferMode] = useState<"table" | "items">("items");
  const [transferOpen, setTransferOpen] = useState(false);
  const [shiftQuantities, setShiftQuantities] = useState<Record<string, string>>({});
  const [orderStateItems, setOrderStateItems] = useState<StateItem[]>([]);
  const [orderStateSearch, setOrderStateSearch] = useState("");
  const [billPrintIntent, setBillPrintIntent] = useState<"generate" | null>(null);
  const [pendingBillAdjustments, setPendingBillAdjustments] = useState<BillAdjustmentPayload>({});
  const [saveWithoutPrintOpen, setSaveWithoutPrintOpen] = useState(false);
  const operationKeys = useOperationKeys();
  const draft = tableId ? Object.values(drafts[tableId] ?? {}) : [];
  const tableOrder = useQuery({
    queryKey: ["tableOrder", tableId],
    queryFn: () => hubApi.tableOrder(tableId as string),
    enabled: Boolean(tableId)
  });
  const data = tableOrder.data;
  const sentItems = (data?.items ?? []).filter((item) => item.status !== "cancelled" && item.quantity > 0);
  const sentItemsSignature = sentItems
    .map((item) => [item.id, item.menu_item_id, item.menu_item_variant_id, item.name_snapshot, item.unit_price_paise, item.quantity, item.note ?? "", item.status].join(":"))
    .join("|");
  const savedOrderStateSignature = getOrderStateSignature(sentItems.map((item) => ({
    orderItemId: item.id,
    menuItemId: item.menu_item_id,
    menuItemVariantId: item.menu_item_variant_id,
    openName: item.menu_item_id ? undefined : item.name_snapshot,
    pricePaise: item.unit_price_paise,
    saleGroupId: item.sale_group_id,
    productionUnitId: item.production_unit_id,
    note: item.note,
    quantity: item.quantity
  })));
  const draftOrderStateSignature = getOrderStateSignature(orderStateItems.map((item) => ({
    orderItemId: item.orderItemId,
    menuItemId: item.menuItemId,
    menuItemVariantId: item.menuItemVariantId,
    openName: item.openName,
    pricePaise: item.pricePaise,
    saleGroupId: item.saleGroupId,
    productionUnitId: item.productionUnitId,
    note: item.note,
    quantity: item.quantity
  })));
  const hasOrderStateChanges = Boolean(data?.order) && savedOrderStateSignature !== draftOrderStateSignature;
  const shiftTargets = bootstrap.tables.filter((table) => table.id !== tableId && isTransferTargetTable(table));
  const selectedShiftTarget = shiftTargets.find((table) => table.id === shiftTargetTableId);
  const draftTotal = draft.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
  const sentTotal = sentItems.reduce((total, item) => total + item.unit_price_paise * item.quantity, 0);
  const editableTotal = orderStateItems.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
  const activeOrderStateItemCount = orderStateItems.filter((item) => item.quantity > 0).length;
  const orderStateGuardMessage =
    data?.order && data.order.status !== "billed" && activeOrderStateItemCount === 0
      ? "Running table must keep at least one item. Use Cancel order instead."
      : null;
  const canSaveOrderState = !orderStateGuardMessage;
  const orderStateMatches = searchMenuItems(bootstrap.menuItems, orderStateSearch, {}).slice(0, 8);
  const setTransferQuantity = (itemId: string, value: number, max: number) => {
    const next = Math.min(max, Math.max(0, Math.trunc(value || 0)));
    setShiftQuantities((current) => ({ ...current, [itemId]: next ? String(next) : "" }));
  };
  const refreshTable = async () => {
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    await queryClient.invalidateQueries({ queryKey: ["tableOrder"] });
  };

  const generateBill = useMutation({
    mutationFn: (printerSlot: BillPrinterSlot) => {
      const orderId = data?.order?.id;
      if (!orderId) throw new Error("No active order to bill.");
      return hubApi.generateBill(orderId, operationKeys.keyFor("bill-generate", { orderId, printerSlot, pendingBillAdjustments }), printerSlot, pendingBillAdjustments);
    },
    onSuccess: async () => {
      await refreshTable();
      setOrderPanel("bill");
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  const cancelOrder = useMutation({
    mutationFn: (approval: ManagerApproval) => {
      const orderId = data?.order?.id;
      if (!orderId) throw new Error("No active order to cancel.");
      return hubApi.cancelOrder(orderId, { managerApproval: approval });
    },
    onSuccess: async () => {
      if (tableId) clearDraft(tableId);
      await refreshTable();
      setOrderPanel("new");
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const shiftTable = useMutation({
    mutationFn: () => {
      if (!tableId || !shiftTargetTableId) throw new Error("Choose a target table first.");
      return hubApi.moveTable({
        fromTableId: tableId,
        toTableId: shiftTargetTableId,
        reason: "Full table transferred from hub"
      });
    },
    onSuccess: async () => {
      const targetId = shiftTargetTableId;
      await refreshTable();
      if (targetId) selectTable(targetId);
      setOrderPanel("sent");
      setNotice({ tone: "good", text: "Table transferred. Source and target checks were refreshed." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const shiftItems = useMutation({
    mutationFn: () => {
      if (!tableId || !shiftTargetTableId) throw new Error("Choose a target table first.");
      const items = sentItems
        .map((item) => ({
          orderItemId: item.id,
          quantity: Math.min(item.quantity, Math.max(0, Number(shiftQuantities[item.id] ?? 0)))
        }))
        .filter((item) => item.quantity > 0);
      if (!items.length) throw new Error("Choose at least one item quantity to transfer.");
      return hubApi.moveItems({
        fromTableId: tableId,
        toTableId: shiftTargetTableId,
        reason: "Selected items transferred from hub",
        items
      });
    },
    onSuccess: async () => {
      const targetId = shiftTargetTableId;
      await refreshTable();
      setShiftQuantities({});
      if (targetId) selectTable(targetId);
      setOrderPanel("sent");
      setNotice({ tone: "good", text: "Selected quantities transferred. Source and target checks were refreshed." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  useEffect(() => {
    setOrderStateItems(sentItems.map((item) => ({
      key: item.id,
      orderItemId: item.id,
      menuItemId: item.menu_item_id ?? undefined,
      menuItemVariantId: item.menu_item_variant_id ?? undefined,
      openName: item.menu_item_id ? undefined : item.name_snapshot,
      pricePaise: item.unit_price_paise,
      saleGroupId: item.sale_group_id,
      saleGroupName: item.sale_group_name_snapshot,
      saleGroupKind: item.sale_group_kind_snapshot,
      productionUnitId: item.production_unit_id,
      name: item.name_snapshot,
      quantity: item.quantity,
      note: item.note ?? ""
    })));
  }, [data?.order?.id, sentItemsSignature]);

  const changeStateQty = (key: string, delta: number) => {
    setOrderStateItems((current) =>
      current.flatMap((item) => {
        if (item.key !== key) return [item];
        const quantity = Math.max(0, item.quantity + delta);
        if (quantity === 0 && !item.orderItemId) return [];
        return [{ ...item, quantity }];
      })
    );
  };

  const changeStateNote = (key: string, note: string) => {
    setOrderStateItems((current) => current.map((item) => (item.key === key ? { ...item, note } : item)));
  };

  const addStateMenuItem = (menuItem: MenuItem, variantId?: string) => {
    const variants = menuItemVariantOptions(menuItem);
    const variant = variants.find((entry) => (entry.id ?? "") === (variantId ?? "")) ?? variants[0];
    const resolvedVariantId = variant?.id;
    const lineName = variant && variant.kind !== "default" ? `${menuItem.name} ${variant.label}` : menuItem.name;
    setOrderStateItems((current) => {
      const existing = current.find((item) => item.menuItemId === menuItem.id && (item.menuItemVariantId ?? "") === (resolvedVariantId ?? ""));
      if (existing) return current.map((item) => item.key === existing.key ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, {
        key: `new-${menuItem.id}-${resolvedVariantId ?? "default"}`,
        menuItemId: menuItem.id,
        menuItemVariantId: resolvedVariantId,
        pricePaise: variant?.price_paise ?? menuItem.price_paise,
        saleGroupId: menuItem.sale_group_id,
        saleGroupName: menuItem.sale_group_name,
        saleGroupKind: menuItem.sale_group_kind,
        productionUnitId: menuItem.production_unit_id,
        name: lineName,
        quantity: 1
      }];
    });
    setOrderStateSearch("");
  };

  const saveOrderState = useMutation({
    mutationFn: async (input: { saveMode: SaveMode; approval?: ManagerApproval }) => {
      const order = data?.order;
      if (!order) throw new Error("No active order to update.");
      if (order.status !== "billed" && orderStateItems.every((item) => item.quantity <= 0)) {
        throw new Error("Running table must keep at least one item. Use Cancel order instead.");
      }
      const payload = {
        saveMode: input.saveMode,
        managerApproval: input.approval,
        items: orderStateItems.map((item) => item.menuItemId
          ? { orderItemId: item.orderItemId, menuItemId: item.menuItemId, menuItemVariantId: item.menuItemVariantId, quantity: item.quantity, note: item.note?.trim() ?? "" }
          : {
              orderItemId: item.orderItemId,
              openName: item.openName ?? item.name,
              openPricePaise: item.pricePaise,
              saleGroupId: item.saleGroupId,
              productionUnitId: item.productionUnitId ?? null,
              quantity: item.quantity,
              note: item.note?.trim() ?? ""
            })
      };
      return hubApi.updateOrderState(order.id, payload, operationKeys.keyFor("order-state", { orderId: order.id, payload }));
    },
    onSuccess: async (_result, input) => {
      await refreshTable();
      setOrderPanel("sent");
      setNotice({ tone: "good", text: input.saveMode === "save" ? "Table state saved without printing." : "Table state saved and modification ticket sent." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  async function requestOrderStateSave(saveMode: SaveMode) {
    const order = data?.order;
    if (!order || saveOrderState.isPending || !hasOrderStateChanges) return;
    if (!canSaveOrderState) {
      setNotice({ tone: "bad", text: "Running table must keep at least one item. Use Cancel order instead." });
      return;
    }
    if (order.status === "billed") {
      const approval = await requestManagerApproval({
        title: "Approve billed table edit",
        defaultReason: saveMode === "save" ? "Billed table state saved" : "Billed table state saved and printed",
        message: "Manager PIN is required to change a printed bill.",
        confirmLabel: saveMode === "save" ? "Save" : "Save and print"
      }).catch(() => null);
      if (!approval) return;
      saveOrderState.mutate({ saveMode, approval });
      return;
    }
    if (saveMode === "save") {
      setSaveWithoutPrintOpen(true);
      return;
    }
    saveOrderState.mutate({ saveMode });
  }

  if (!tableId) {
    return (
      <section className="ticket-workspace panel">
        <EmptyState title="No table selected" description="Choose or add a table before taking an order." />
      </section>
    );
  }

  return (
    <section className="ticket-workspace panel">
      <div className="ticket-header">
        <div>
          <span>Selected table</span>
          <h2>{tableName}</h2>
        </div>
        <div className="ticket-header-actions">
          <div className="total-chip">{formatInr(draftTotal + sentTotal)}</div>
          {onClose ? (
            <button type="button" className="quiet-button" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
      </div>
      <div className="segmented">
        <button type="button" className={orderPanel === "new" ? "active" : ""} onClick={() => setOrderPanel("new")}>New order</button>
        <button type="button" className={orderPanel === "sent" ? "active" : ""} onClick={() => setOrderPanel("sent")}>Sent items</button>
        <button type="button" className={orderPanel === "bill" ? "active" : ""} onClick={() => setOrderPanel("bill")}>Bill</button>
      </div>

      {orderPanel === "new" ? (
        <NewOrderPanel
          tableId={tableId}
          bootstrap={bootstrap}
          draft={draft}
          setNotice={setNotice}
          refreshTable={refreshTable}
        />
      ) : null}

      {orderPanel === "sent" ? (
        <SentOrderPanel
          data={data}
          orderStateItems={orderStateItems}
          orderStateSearch={orderStateSearch}
          setOrderStateSearch={setOrderStateSearch}
          orderStateMatches={orderStateMatches}
          editableTotal={editableTotal}
          hasOrderStateChanges={hasOrderStateChanges}
          canSaveOrderState={canSaveOrderState}
          orderStateGuardMessage={orderStateGuardMessage}
          saveOrderStatePending={saveOrderState.isPending}
          requestOrderStateSave={(saveMode) => void requestOrderStateSave(saveMode)}
          addStateMenuItem={addStateMenuItem}
          changeStateQty={changeStateQty}
          changeStateNote={changeStateNote}
          transferOpen={transferOpen}
          setTransferOpen={setTransferOpen}
          transferMode={transferMode}
          setTransferMode={setTransferMode}
          shiftTargetTableId={shiftTargetTableId}
          setShiftTargetTableId={setShiftTargetTableId}
          shiftTargets={shiftTargets}
          selectedShiftTarget={selectedShiftTarget}
          sentItems={sentItems}
          shiftQuantities={shiftQuantities}
          setTransferQuantity={setTransferQuantity}
          tableName={tableName}
          shiftTablePending={shiftTable.isPending}
          shiftItemsPending={shiftItems.isPending}
          onTransfer={() => {
            if (transferMode === "table") shiftTable.mutate();
            else shiftItems.mutate();
          }}
          cancelOrderPending={cancelOrder.isPending}
          onCancelOrder={async () => {
            const approval = await requestManagerApproval({
              title: "Cancel running order",
              defaultReason: "Order cancelled",
              confirmLabel: cancelOrder.isPending ? "Cancelling..." : "Cancel order",
              danger: true,
            }).catch(() => null);
            if (approval) cancelOrder.mutate(approval);
          }}
        />
      ) : null}

      {orderPanel === "bill" ? (
        <BillingPanel
          tableOrder={data}
          menuItems={bootstrap.menuItems}
          sentTotal={sentTotal}
          generateBill={(adjustments) => {
            setPendingBillAdjustments(adjustments);
            setBillPrintIntent("generate");
          }}
          generating={generateBill.isPending || tableOrder.isFetching}
          onSettled={refreshTable}
          setNotice={setNotice}
          requestManagerApproval={requestManagerApproval}
        />
      ) : null}
      <BillPrinterChooser
        open={billPrintIntent === "generate"}
        title="Print bill where?"
        busy={generateBill.isPending}
        onClose={() => setBillPrintIntent(null)}
        onChoose={(printerSlot) => {
          setBillPrintIntent(null);
          generateBill.mutate(printerSlot);
        }}
      />
      <ConfirmationDialog
        open={saveWithoutPrintOpen}
        title="Save without printing?"
        message="Save these table changes without printing a modification KOT/BOT?"
        cancelLabel="Keep editing"
        confirmLabel="Save without print"
        busy={saveOrderState.isPending}
        onCancel={() => setSaveWithoutPrintOpen(false)}
        onConfirm={() => {
          setSaveWithoutPrintOpen(false);
          saveOrderState.mutate({ saveMode: "save" });
        }}
      />
    </section>
  );
}
