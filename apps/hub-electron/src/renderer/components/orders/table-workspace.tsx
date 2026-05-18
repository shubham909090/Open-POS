import { formatInr, getOrderStateSignature, isTransferTargetTable, searchMenuItems } from "@gaurav-pos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { hubApi, type BillPrinterSlot, type Bootstrap, type MenuItem } from "../../hub-api.js";
import { menuItemVariantOptions, messageOf, type NoticeSetter } from "../../lib/format.js";
import type { ManagerApproval, ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { useKeyboardListNavigation } from "../../hooks/use-keyboard-list-navigation.js";
import { useOperationKeys } from "../../hooks/use-operation-keys.js";
import { useHubStore } from "../../store.js";
import { EmptyState } from "../ui/empty-state.js";
import { LineItems } from "./line-items.js";
import { BillingPanel } from "./billing-panel.js";
import { BillPrinterChooser } from "./bill-printer-chooser.js";
import { SentOrderPanel } from "./sent-order-panel.js";
import { CategoryBadge, getMenuActionVariants, MenuItemActionGroup } from "./menu-card.js";

type PrintMode = "kot" | "kot_print";
export type SaveMode = "save" | "save_print";
export type StateItem = {
  key: string;
  orderItemId?: string;
  menuItemId?: string;
  menuItemVariantId?: string;
  openName?: string;
  pricePaise: number;
  saleGroupId: string;
  productionUnitId?: string | null;
  name: string;
  quantity: number;
};

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
  const addDraftItem = useHubStore((state) => state.addDraftItem);
  const addOpenDraftItem = useHubStore((state) => state.addOpenDraftItem);
  const changeDraftQty = useHubStore((state) => state.changeDraftQty);
  const clearDraft = useHubStore((state) => state.clearDraft);
  const [guests, setGuests] = useState("2");
  const [openName, setOpenName] = useState("");
  const [openPrice, setOpenPrice] = useState("");
  const [openGroup, setOpenGroup] = useState("sg-food");
  const [openUnit, setOpenUnit] = useState("");
  const [shiftTargetTableId, setShiftTargetTableId] = useState("");
  const [transferMode, setTransferMode] = useState<"table" | "items">("items");
  const [transferOpen, setTransferOpen] = useState(false);
  const [shiftQuantities, setShiftQuantities] = useState<Record<string, string>>({});
  const [orderStateItems, setOrderStateItems] = useState<StateItem[]>([]);
  const [orderStateSearch, setOrderStateSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [kotNote, setKotNote] = useState("");
  const [billPrintIntent, setBillPrintIntent] = useState<"generate" | null>(null);
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
    .map((item) => [item.id, item.menu_item_id, item.menu_item_variant_id, item.name_snapshot, item.unit_price_paise, item.quantity, item.status].join(":"))
    .join("|");
  const savedOrderStateSignature = getOrderStateSignature(sentItems.map((item) => ({
    orderItemId: item.id,
    menuItemId: item.menu_item_id,
    menuItemVariantId: item.menu_item_variant_id,
    openName: item.menu_item_id ? undefined : item.name_snapshot,
    pricePaise: item.unit_price_paise,
    saleGroupId: item.sale_group_id,
    productionUnitId: item.production_unit_id,
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
    quantity: item.quantity
  })));
  const hasOrderStateChanges = Boolean(data?.order) && savedOrderStateSignature !== draftOrderStateSignature;
  const shiftTargets = bootstrap.tables.filter((table) => table.id !== tableId && isTransferTargetTable(table));
  const selectedShiftTarget = shiftTargets.find((table) => table.id === shiftTargetTableId);
  const draftTotal = draft.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
  const sentTotal = sentItems.reduce((total, item) => total + item.unit_price_paise * item.quantity, 0);
  const editableTotal = orderStateItems.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
  const orderStateMatches = searchMenuItems(bootstrap.menuItems, orderStateSearch, {}).slice(0, 8);
  const draftMatches = searchMenuItems(bootstrap.menuItems, draftSearch, {}).slice(0, 8);
  const draftMatchIds = draftMatches.map((item) => item.id).join("|");
  const addKeyboardDraftItem = useCallback(
    (item: MenuItem) => {
      if (!tableId) return;
      const variant = getMenuActionVariants(item)[0];
      if (!variant) return;
      addDraftItem(tableId, item, variant.id || undefined);
      setDraftSearch("");
    },
    [addDraftItem, tableId]
  );
  const draftKeyboard = useKeyboardListNavigation({
    items: draftMatches,
    enabled: Boolean(tableId && draftSearch.trim()),
    resetKey: `${draftSearch}|${draftMatchIds}`,
    onCommit: addKeyboardDraftItem
  });
  const setTransferQuantity = (itemId: string, value: number, max: number) => {
    const next = Math.min(max, Math.max(0, Math.trunc(value || 0)));
    setShiftQuantities((current) => ({ ...current, [itemId]: next ? String(next) : "" }));
  };
  const refreshTable = async () => {
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    await queryClient.invalidateQueries({ queryKey: ["tableOrder"] });
  };

  const submitOrder = useMutation({
    mutationFn: (printMode: PrintMode) => {
      if (!tableId || draft.length === 0) throw new Error("Add at least one new dish before sending KOT.");
      const payload = {
        tableId,
        pax: Number(guests || 1),
        printMode,
        note: kotNote.trim() || undefined,
        items: draft.map((item) =>
          item.openName
            ? {
                openName: item.openName,
                openPricePaise: item.pricePaise,
                saleGroupId: item.saleGroupId ?? "sg-food",
                productionUnitId: item.productionUnitId ?? null,
                quantity: item.quantity
              }
            : { menuItemId: item.menuItemId, menuItemVariantId: item.menuItemVariantId, quantity: item.quantity }
        )
      };
      return hubApi.submitOrder(payload, operationKeys.keyFor("orders-submit", payload));
    },
    onSuccess: async (_result, printMode) => {
      if (tableId) clearDraft(tableId);
      setKotNote("");
      await refreshTable();
      setOrderPanel("sent");
      setNotice({
        tone: "good",
        text: printMode === "kot" ? "KOT saved. New item list is clear now." : "Print and KOT sent. New item list is clear now."
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const canSendDraft = orderPanel === "new" && Boolean(tableId) && draft.length > 0 && !submitOrder.isPending;
  const sendDraft = (printMode: PrintMode) => {
    if (!canSendDraft) return;
    submitOrder.mutate(printMode);
  };

  useEffect(() => {
    if (!canSendDraft) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "F3") {
        event.preventDefault();
        submitOrder.mutate("kot");
      }
      if (event.key === "F6") {
        event.preventDefault();
        submitOrder.mutate("kot_print");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canSendDraft, submitOrder]);

  const generateBill = useMutation({
    mutationFn: (printerSlot: BillPrinterSlot) => {
      const orderId = data?.order?.id;
      if (!orderId) throw new Error("No active order to bill.");
      return hubApi.generateBill(orderId, operationKeys.keyFor("bill-generate", { orderId, printerSlot }), printerSlot);
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
      productionUnitId: item.production_unit_id,
      name: item.name_snapshot,
      quantity: item.quantity
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
      if (input.saveMode === "save" && order.status !== "billed") {
        const ok = window.confirm("Save these table changes without printing a modification KOT/BOT?");
        if (!ok) throw new Error("Table changes were not saved.");
      }
      const payload = {
        saveMode: input.saveMode,
        managerApproval: input.approval,
        items: orderStateItems.map((item) => item.menuItemId
          ? { orderItemId: item.orderItemId, menuItemId: item.menuItemId, menuItemVariantId: item.menuItemVariantId, quantity: item.quantity }
          : {
              orderItemId: item.orderItemId,
              openName: item.openName ?? item.name,
              openPricePaise: item.pricePaise,
              saleGroupId: item.saleGroupId,
              productionUnitId: item.productionUnitId ?? null,
              quantity: item.quantity
            })
      };
      return hubApi.updateOrderState(order.id, payload, operationKeys.keyFor("order-state", { orderId: order.id, payload }));
    },
    onSuccess: async (_result, input) => {
      await refreshTable();
      setOrderPanel("sent");
      setNotice({ tone: "good", text: input.saveMode === "save" ? "Table state saved without printing." : "Table state saved and modification ticket sent." });
    },
    onError: (error) => {
      if (messageOf(error) === "Table changes were not saved.") return;
      setNotice({ tone: "bad", text: messageOf(error) });
    }
  });

  async function requestOrderStateSave(saveMode: SaveMode) {
    const order = data?.order;
    if (!order || saveOrderState.isPending || !hasOrderStateChanges) return;
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
        <div className="ticket-section">
          <div className="guest-row">
            <label>
              Guests
              <input value={guests} onChange={(event) => setGuests(event.target.value)} inputMode="numeric" />
            </label>
            <label className="kot-note-field">
              Kitchen / bar note
              <input
                value={kotNote}
                onChange={(event) => setKotNote(event.target.value)}
                maxLength={500}
                placeholder="Optional note for KOT/BOT only"
              />
            </label>
            <div className="send-action-row">
              <button type="button" aria-label="KOT F3" disabled={!canSendDraft} onClick={() => sendDraft("kot")}>
                <span>KOT</span>
                <kbd>F3</kbd>
              </button>
              <button type="button" aria-label="Print and KOT F6" disabled={!canSendDraft} onClick={() => sendDraft("kot_print")}>
                <span>{submitOrder.isPending ? "Sending..." : "Print and KOT"}</span>
                <kbd>F6</kbd>
              </button>
            </div>
          </div>
          <section className="state-editor draft-menu-search">
            <div className="state-editor-head">
              <div className="state-editor-total">
                <small>New order</small>
                <strong>{formatInr(draftTotal)}</strong>
              </div>
              <span className="state-editor-status">{draft.length} {draft.length === 1 ? "item" : "items"}</span>
            </div>
            <div className="state-search">
              <label className="state-search-field">
                <span>Add dish</span>
                <input
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                  onKeyDown={draftKeyboard.onKeyDown}
                  placeholder="Search menu item"
                />
              </label>
              {draftSearch.trim() ? (
                <div className="state-search-results">
                  {draftMatches.map((item, index) => {
                    const variants = getMenuActionVariants(item);
                    return (
                      <div
                        key={item.id}
                        className={`state-search-row menu-card compact-menu-card category-${item.sale_group_kind ?? "other"}${draftKeyboard.activeIndex === index ? " keyboard-active" : ""}`}
                        onMouseEnter={() => draftKeyboard.setActiveIndex(index)}
                      >
                        <CategoryBadge kind={item.sale_group_kind} className="state-search-icon" />
                        <div className="menu-card-main">
                          <strong>{item.name}</strong>
                          <span>{item.sale_group_name ?? item.production_unit_name ?? "Menu item"}</span>
                        </div>
                        <footer>
                          <MenuItemActionGroup
                            itemName={item.name}
                            variants={variants}
                            onAdd={(variantId) => {
                              addDraftItem(tableId, item, variantId);
                              setDraftSearch("");
                            }}
                            className="state-search-actions"
                          />
                        </footer>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>
          <form
            className="open-item-form"
            onSubmit={(event) => {
              event.preventDefault();
              const pricePaise = Math.round(Number(openPrice || 0) * 100);
              if (!openName.trim() || pricePaise <= 0) {
                setNotice({ tone: "bad", text: "Enter open item name and price." });
                return;
              }
              addOpenDraftItem(tableId, {
                name: openName.trim(),
                pricePaise,
                saleGroupId: openGroup,
                productionUnitId: openUnit || null
              });
              setOpenName("");
              setOpenPrice("");
            }}
          >
            <label>
              Open item
              <input value={openName} onChange={(event) => setOpenName(event.target.value)} placeholder="Open food / bar item" />
            </label>
            <label>
              Price
              <input value={openPrice} onChange={(event) => setOpenPrice(event.target.value)} inputMode="decimal" />
            </label>
            <label>
              Group
              <select value={openGroup} onChange={(event) => setOpenGroup(event.target.value)}>
                {bootstrap.saleGroups.filter((group) => group.active).map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </label>
            <label>
              Print to
              <select value={openUnit} onChange={(event) => setOpenUnit(event.target.value)}>
                <option value="">Group default / no KOT</option>
                {bootstrap.productionUnits.filter((unit) => unit.active).map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </label>
            <button type="submit">Add open item</button>
          </form>
          <LineItems
            emptyTitle="No new dishes selected"
            emptyText="Tap dishes from the menu. This list is only new items not sent yet."
            rows={draft.map((item) => ({
              id: item.lineKey,
              title: item.variantLabel ? `${item.name} ${item.variantLabel}` : item.name,
              meta: `${formatInr(item.pricePaise)} each`,
              quantity: item.quantity,
              amount: item.pricePaise * item.quantity,
              onMinus: () => changeDraftQty(tableId, item.lineKey, -1),
              onPlus: () => changeDraftQty(tableId, item.lineKey, 1)
            }))}
          />
        </div>
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
          saveOrderStatePending={saveOrderState.isPending}
          requestOrderStateSave={(saveMode) => void requestOrderStateSave(saveMode)}
          addStateMenuItem={addStateMenuItem}
          changeStateQty={changeStateQty}
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
          generateBill={() => setBillPrintIntent("generate")}
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
    </section>
  );
}
