import { formatInr } from "@gaurav-pos/shared";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useKeyboardListNavigation } from "../../hooks/use-keyboard-list-navigation.js";
import type { Bootstrap, MenuItem, OrderItem, Table, TableOrder } from "../../hub-api.js";
import { LineItems } from "./line-items.js";
import { CategoryBadge, getMenuActionVariants, MenuItemActionGroup } from "./menu-card.js";
import type { SaveMode, StateItem } from "./table-workspace.js";

export function SentOrderPanel({
  data,
  orderStateItems,
  orderStateSearch,
  setOrderStateSearch,
  orderStateMatches,
  editableTotal,
	  hasOrderStateChanges,
	  canSaveOrderState,
	  orderStateGuardMessage,
	  saveOrderStatePending,
  requestOrderStateSave,
  addStateMenuItem,
  changeStateQty,
  changeStateNote,
  transferOpen,
  setTransferOpen,
  transferMode,
  setTransferMode,
  shiftTargetTableId,
  setShiftTargetTableId,
  shiftTargets,
  selectedShiftTarget,
  sentItems,
  shiftQuantities,
  setTransferQuantity,
  tableName,
  shiftTablePending,
  shiftItemsPending,
  onTransfer,
  cancelOrderPending,
  onCancelOrder,
}: {
  data: TableOrder | null | undefined;
  orderStateItems: StateItem[];
  orderStateSearch: string;
  setOrderStateSearch: Dispatch<SetStateAction<string>>;
  orderStateMatches: MenuItem[];
  editableTotal: number;
	  hasOrderStateChanges: boolean;
	  canSaveOrderState: boolean;
	  orderStateGuardMessage?: string | null;
	  saveOrderStatePending: boolean;
  requestOrderStateSave: (saveMode: SaveMode) => void;
  addStateMenuItem: (menuItem: MenuItem, variantId?: string) => void;
  changeStateQty: (key: string, delta: number) => void;
  changeStateNote: (key: string, note: string) => void;
  transferOpen: boolean;
  setTransferOpen: Dispatch<SetStateAction<boolean>>;
  transferMode: "table" | "items";
  setTransferMode: Dispatch<SetStateAction<"table" | "items">>;
  shiftTargetTableId: string;
  setShiftTargetTableId: Dispatch<SetStateAction<string>>;
  shiftTargets: Bootstrap["tables"];
  selectedShiftTarget?: Table;
  sentItems: OrderItem[];
  shiftQuantities: Record<string, string>;
  setTransferQuantity: (itemId: string, value: number, max: number) => void;
  tableName: string;
  shiftTablePending: boolean;
  shiftItemsPending: boolean;
  onTransfer: () => void;
  cancelOrderPending: boolean;
  onCancelOrder: () => void;
}) {
  const orderStateMatchIds = orderStateMatches.map((item) => item.id).join("|");
  const addKeyboardStateItem = useCallback(
    (item: MenuItem) => {
      const variant = getMenuActionVariants(item)[0];
      if (!variant) return;
      addStateMenuItem(item, variant.id || undefined);
    },
    [addStateMenuItem]
  );
  const orderStateKeyboard = useKeyboardListNavigation({
    items: orderStateMatches,
    enabled: Boolean(orderStateSearch.trim()),
    resetKey: `${orderStateSearch}|${orderStateMatchIds}`,
    onCommit: addKeyboardStateItem
  });

  return (
    <div className="ticket-section">
      {data?.order ? (
        <section className="state-editor">
          <div className="state-editor-head">
            <div className="state-editor-total">
              <small>Edited total</small>
              <strong>{formatInr(editableTotal)}</strong>
            </div>
	            {hasOrderStateChanges ? (
	              <div className="state-editor-actions">
	                <button
	                  type="button"
	                  className="secondary-button"
	                  disabled={saveOrderStatePending || !canSaveOrderState}
                  onClick={() => requestOrderStateSave("save")}
                >
                  {saveOrderStatePending ? "Saving..." : "Save"}
                </button>
                <button
	                  type="button"
	                  disabled={saveOrderStatePending || !canSaveOrderState}
                  onClick={() => requestOrderStateSave("save_print")}
                >
                  {saveOrderStatePending ? "Sending..." : "Save and print"}
                </button>
              </div>
	            ) : (
	              <span className="state-editor-status">Saved</span>
	            )}
	          </div>
	          {orderStateGuardMessage ? <p className="state-editor-warning">{orderStateGuardMessage}</p> : null}
          <div className="state-search">
            <label className="state-search-field">
              <span>Add item</span>
              <input
                value={orderStateSearch}
                onChange={(event) => setOrderStateSearch(event.target.value)}
                onKeyDown={orderStateKeyboard.onKeyDown}
                placeholder="Search menu item"
              />
            </label>
            {orderStateSearch.trim() ? (
              <div className="state-search-results">
                {orderStateMatches.map((item, index) => {
                  const variants = getMenuActionVariants(item);
                  return (
                    <div
                      key={item.id}
                      className={`state-search-row menu-card compact-menu-card category-${item.sale_group_kind ?? "other"}${orderStateKeyboard.activeIndex === index ? " keyboard-active" : ""}`}
                      onMouseEnter={() => orderStateKeyboard.setActiveIndex(index)}
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
                          onAdd={(variantId) => addStateMenuItem(item, variantId)}
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
      ) : null}
      <LineItems
        emptyTitle="Nothing sent yet"
        emptyText="Use the search above to add items to this table."
        rows={orderStateItems.map((item) => ({
          id: item.key,
          title: item.name,
          meta: `${formatInr(item.pricePaise)} each`,
          saleGroupKind: item.saleGroupKind,
          saleGroupName: item.saleGroupName,
          quantity: item.quantity,
          amount: item.pricePaise * item.quantity,
          onMinus: () => changeStateQty(item.key, -1),
          onPlus: () => changeStateQty(item.key, 1),
          note: item.note ?? "",
          onNoteChange: (note) => changeStateNote(item.key, note),
        }))}
      />
      {data?.order ? (
        <section className="shift-panel transfer-panel">
          <button
            type="button"
            className="transfer-panel-toggle"
            onClick={() => setTransferOpen((current) => !current)}
            aria-expanded={transferOpen}
          >
            <div>
              <strong>Transfer table or items</strong>
            </div>
            <span>{transferOpen ? "Hide" : "Open"}</span>
          </button>
          {transferOpen ? (
            <div className="transfer-panel-body">
              <div className="transfer-panel-head">
                <div className="transfer-mode-toggle" role="group" aria-label="Transfer mode">
                  <button
                    type="button"
                    className={transferMode === "items" ? "active" : ""}
                    onClick={() => setTransferMode("items")}
                  >
                    Items
                  </button>
                  <button
                    type="button"
                    className={transferMode === "table" ? "active" : ""}
                    onClick={() => setTransferMode("table")}
                  >
                    Full table
                  </button>
                </div>
              </div>
              <label className="transfer-target-field">
                Target table
                <select
                  value={shiftTargetTableId}
                  onChange={(event) => setShiftTargetTableId(event.target.value)}
                >
                  <option value="">Choose active table</option>
                  {shiftTargets.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedShiftTarget ? (
                <p className="transfer-target-note">
                  Target is {selectedShiftTarget.status === "free" ? "free" : `${selectedShiftTarget.status}. Items will be added to its running check.`}
                </p>
              ) : null}
              {transferMode === "items" ? (
                <div className="transfer-item-list">
                  {sentItems.map((item) => {
                    const quantity = Math.min(item.quantity, Math.max(0, Number(shiftQuantities[item.id] ?? 0)));
                    return (
                      <div key={item.id} className="transfer-item-row">
                        <div>
                          <strong>{item.name_snapshot}</strong>
                          <span>{item.quantity} available · {formatInr(item.unit_price_paise)} each</span>
                        </div>
                        <div className="transfer-qty-control" aria-label={`Transfer quantity for ${item.name_snapshot}`}>
                          <button type="button" onClick={() => setTransferQuantity(item.id, quantity - 1, item.quantity)} disabled={quantity <= 0}>
                            -
                          </button>
                          <input
                            value={quantity ? String(quantity) : ""}
                            onChange={(event) => setTransferQuantity(item.id, Number(event.target.value.replace(/\D/g, "")), item.quantity)}
                            onBlur={() => setTransferQuantity(item.id, quantity, item.quantity)}
                            inputMode="numeric"
                            placeholder="0"
                            aria-label={`Quantity, max ${item.quantity}`}
                          />
                          <button type="button" onClick={() => setTransferQuantity(item.id, quantity + 1, item.quantity)} disabled={quantity >= item.quantity}>
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="transfer-warning">
                  This moves every sent item from {tableName} to the target table and frees {tableName}.
                </p>
              )}
              <button
                type="button"
                className="transfer-submit-button"
                disabled={!selectedShiftTarget || shiftTablePending || shiftItemsPending}
                onClick={onTransfer}
              >
                {shiftTablePending || shiftItemsPending ? "Transferring..." : transferMode === "table" ? "Transfer full table" : "Transfer selected quantities"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {data?.order ? (
        <button
          type="button"
          className="danger-link"
          disabled={cancelOrderPending}
          onClick={onCancelOrder}
        >
          {cancelOrderPending ? "Cancelling..." : "Cancel order"}
        </button>
      ) : null}
    </div>
  );
}
