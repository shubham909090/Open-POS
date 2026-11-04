import { formatInr, getTableDisplayState, searchMenuItems, tableDisplayClass, tableDisplayLabel, type SaleGroupKind, type TableDisplayState } from "@gaurav-pos/shared";
import { Clock3, PanelLeftOpen, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NoticeSetter } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { useKeyboardListNavigation } from "../../hooks/use-keyboard-list-navigation.js";
import type { Bootstrap } from "../../hub-api.js";
import { useHubStore, type OrderPanel } from "../../store.js";
import { sortTables } from "../../lib/table-order.js";
import { EmptyState } from "../ui/empty-state.js";
import { getMenuActionVariants, MenuResultSection } from "./menu-card.js";
import { TableWorkspace } from "./table-workspace.js";

export function OrdersView({ bootstrap, setNotice, requestManagerApproval, operationNotice }: { bootstrap: Bootstrap; setNotice: NoticeSetter; requestManagerApproval: ManagerApprovalRequest; operationNotice?: Parameters<NoticeSetter>[0] | null }) {
  const selectedTableId = useHubStore((state) => state.selectedTableId);
  const selectTable = useHubStore((state) => state.selectTable);
  const clearSelectedTable = useHubStore((state) => state.clearSelectedTable);
  const orderPanel = useHubStore((state) => state.orderPanel);
  const setOrderPanel = useHubStore((state) => state.setOrderPanel);
  const search = useHubStore((state) => state.menuSearch);
  const setSearch = useHubStore((state) => state.setMenuSearch);
  const addDraftItem = useHubStore((state) => state.addDraftItem);
  const drafts = useHubStore((state) => state.drafts);
  const tableOrderMode = useHubStore((state) => state.tableOrderMode);
  const [saleGroupFilter, setSaleGroupFilter] = useState<SaleGroupKind | null>(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const tableTriggerRef = useRef<HTMLElement | null>(null);
  const activeTables = bootstrap.tables.filter((table) => table.active);
  const selectedTable = activeTables.find((table) => table.id === selectedTableId) ?? null;
  const selectedTableDuration = selectedTable ? formatTableDuration(selectedTable, nowMs) : null;

  const saleGroupKinds = Array.from(new Map(bootstrap.saleGroups.filter((group) => group.active).map((group) => [group.kind, group.name])).entries());
  const preferredSaleGroup = (["food", "beverage", "alcohol", "other"] as SaleGroupKind[]).find((kind) =>
    saleGroupKinds.some(([saleGroupKind]) => saleGroupKind === kind) &&
    bootstrap.menuItems.some((item) => item.active && item.sale_group_kind === kind)
  );
  const activeSaleGroup = saleGroupFilter ?? preferredSaleGroup ?? (saleGroupKinds[0]?.[0] as SaleGroupKind | undefined);
  const hasSearch = search.trim().length > 0;
  const activeItems = searchMenuItems(bootstrap.menuItems, search, { saleGroupKind: activeSaleGroup }).slice(0, 80);
  const activeItemIds = activeItems.map((item) => item.id).join("|");
  const addKeyboardMenuItem = useCallback(
    (item: Bootstrap["menuItems"][number]) => {
      if (!selectedTable) return;
      const variant = getMenuActionVariants(item)[0];
      if (!variant) return;
      addDraftItem(selectedTable.id, item, variant.id || undefined);
    },
    [addDraftItem, selectedTable]
  );
  const menuKeyboard = useKeyboardListNavigation({
    items: activeItems,
    enabled: Boolean(selectedTable && menuOpen),
    resetKey: `${search}|${activeSaleGroup ?? ""}|${activeItemIds}`,
    onCommit: addKeyboardMenuItem
  });
  const activeKeyboardItemId = activeItems[menuKeyboard.activeIndex]?.id;
  const openTablePanel = (tableId: string, panel: OrderPanel) => {
    if (!selectedTable && document.activeElement instanceof HTMLElement) tableTriggerRef.current = document.activeElement;
    selectTable(tableId);
    setOrderPanel(panel);
  };

  useEffect(() => {
    if (selectedTable) setMenuOpen(orderPanel === "new");
  }, [selectedTable?.id, orderPanel]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="orders-grid tables-first">
      <section className="table-map panel">
        <div className="panel-title">
          <div>
            <h2>Tables</h2>
          </div>
          <div className="table-map-counts" aria-label="Table state counts">
            <span className="state-dot free">{activeTables.filter((table) => getTableDisplayState(table) === "free").length} free</span>
            <span className="state-dot running">{activeTables.filter((table) => getTableDisplayState(table) === "running").length} running</span>
            <span className="state-dot billed">{activeTables.filter((table) => getTableDisplayState(table) === "bill_printed").length} billed</span>
          </div>
        </div>
        <div className="floor-table-list">
          {bootstrap.floors.filter((floor) => floor.active).map((floor) => {
            const floorTables = sortTables(activeTables.filter((table) => table.floor_id === floor.id), tableOrderMode);
            if (!floorTables.length) return null;
            return (
              <div className="floor-group" key={floor.id}>
                <div className="floor-group-header">
                  <h3>{floor.name}</h3>
                  <span>{floorTables.length}</span>
                </div>
                <div className="table-list">
                  {floorTables.map((table) => {
                    const displayState = getTableDisplayState(table);
                    const tableDraft = Object.values(drafts[table.id] ?? {});
                    const draftQuantity = tableDraft.reduce((total, item) => total + item.quantity, 0);
                    const draftTotal = tableDraft.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
                    const hasLocalDraftWarning = displayState === "free" && draftQuantity > 0;
                    const isLiveTable = table.current_order_id && displayState !== "free";
                    const duration = formatTableDuration(table, nowMs);
                    const tileClass = [
                      "table-tile",
                      hasLocalDraftWarning ? "draft-warning" : tableDisplayClass(displayState),
                      table.id === selectedTable?.id ? "active" : ""
                    ].filter(Boolean).join(" ");
                    return (
                      <article
                        key={table.id}
                        className={tileClass}
                      >
                        <button type="button" className="table-tile-main" aria-label={`Open table ${table.name}, ${hasLocalDraftWarning ? `${draftQuantity} unsent items` : tableDisplayLabel(displayState)}${duration ? `, open for ${duration}` : ""}`} onClick={() => openTablePanel(table.id, "new")}>
                          <span className="table-tile-topline">
                            <strong className="table-tile-name">{table.name}</strong>
                            {duration ? (
                              <span className="table-tile-duration" aria-hidden="true">
                                <Clock3 size={12} />
                                <span>{duration}</span>
                              </span>
                            ) : null}
                          </span>
                          <span className="table-tile-meta">
                            <span className="table-tile-state">
                              {hasLocalDraftWarning ? `Draft ${draftQuantity} ${draftQuantity === 1 ? "item" : "items"}` : tileStateLabel(displayState)}
                            </span>
                            {isLiveTable ? <b className="table-tile-total">{formatInr(table.current_order_total_paise)}</b> : null}
                            {hasLocalDraftWarning ? <b className="table-tile-total">{formatInr(draftTotal)}</b> : null}
                          </span>
                        </button>
                        {isLiveTable ? (
                          <div className="table-tile-actions" aria-label={`${table.name} shortcuts`}>
                            <button type="button" className="table-tile-shortcut" onClick={() => openTablePanel(table.id, "sent")}>
                              Sent {table.sent_item_count}
                            </button>
                            <button type="button" className="table-tile-shortcut primary" onClick={() => openTablePanel(table.id, "bill")}>
                              Bill
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!activeTables.length ? <EmptyState title="Add a table first" description="Setup needs at least one active table before orders can start." /> : null}
        </div>
      </section>

      {selectedTable ? (
        <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) clearSelectedTable(); }}>
          <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="modal-backdrop order-modal-backdrop" />
          <DialogPrimitive.Content className="order-modal-card" aria-label={`${selectedTable.name} order workspace`} onPointerDownOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => {
            if (tableTriggerRef.current?.isConnected) {
              event.preventDefault();
              tableTriggerRef.current.focus();
            }
          }}>
            <header className="order-modal-header">
              <div className="order-modal-title">
                <DialogPrimitive.Title asChild><h2>{selectedTable.name}<span className="sr-only"> order workspace</span></h2></DialogPrimitive.Title>
                <span className="order-modal-meta">
                  <span>{selectedTable.floor_name}</span>
                  <span>{tileStateLabel(getTableDisplayState(selectedTable))}</span>
                  {selectedTableDuration ? (
                    <span className="order-modal-duration" aria-label={`${selectedTable.name} open for ${selectedTableDuration}`}>
                      <Clock3 size={13} aria-hidden="true" />
                      {selectedTableDuration}
                    </span>
                  ) : null}
                </span>
                <DialogPrimitive.Description className="sr-only">Add items, review kitchen tickets and settle this table's bill.</DialogPrimitive.Description>
              </div>
              <div className="order-modal-actions">
                <button type="button" className="secondary-button" onClick={() => setMenuOpen((open) => !open)}>
                  <PanelLeftOpen size={16} />
                  {menuOpen ? "Hide menu" : "Open menu"}
                </button>
                <button type="button" className="order-icon-button" onClick={clearSelectedTable} aria-label="Close selected table">
                  <X size={18} />
                </button>
              </div>
            </header>
            <div className={menuOpen ? "order-modal-layout menu-open" : "order-modal-layout menu-closed"}>
              {menuOpen ? (
                <section className="menu-browser order-menu-panel">
                  <div className="panel-title">
                    <h2>Menu</h2>
                    <div className="menu-browser-title-actions">
                      <input
                        autoFocus
                        aria-label="Search dishes"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={menuKeyboard.onKeyDown}
                        placeholder="Search dish"
                      />
                    </div>
                  </div>
                  <div className="menu-filter-row" aria-label="Menu filters">
                    {saleGroupKinds.map(([kind, label]) => (
                      <button key={kind} type="button" aria-pressed={activeSaleGroup === kind} className={activeSaleGroup === kind ? "active" : ""} onClick={() => setSaleGroupFilter(kind as SaleGroupKind)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <MenuResultSection
                    title={hasSearch ? "Best matches" : (saleGroupKinds.find(([kind]) => kind === activeSaleGroup)?.[1] ?? "Menu")}
                    items={activeItems}
                    selectedTableId={selectedTable.id}
                    onAdd={addDraftItem}
                    activeItemId={activeKeyboardItemId}
                    onItemPointerMove={menuKeyboard.onPointerMove}
                    setItemElement={menuKeyboard.setItemElement}
                    emptyText={hasSearch ? "No dishes found. Check spelling or clear filters." : "No dishes found. Add active dishes in setup."}
                  />
                </section>
              ) : null}
              <TableWorkspace
                tableId={selectedTable.id}
                tableName={selectedTable.name}
                bootstrap={bootstrap}
                setNotice={setNotice}
                requestManagerApproval={requestManagerApproval}
                operationNotice={operationNotice}
                menuVisible={menuOpen}
              />
            </div>
          </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      ) : null}
    </div>
  );
}

// Tiles are narrow; "Billed" matches the header count wording. Screen readers get the full label from the button.
function tileStateLabel(state: TableDisplayState): string {
  return state === "bill_printed" ? "Billed" : tableDisplayLabel(state);
}

export function formatTableDuration(table: Pick<Bootstrap["tables"][number], "occupied_at" | "timer_ended_at" | "status">, nowMs = Date.now()): string | null {
  if (!table.occupied_at) return null;
  const startMs = new Date(table.occupied_at).getTime();
  if (!Number.isFinite(startMs)) return null;
  const displayState = getTableDisplayState(table);
  const endMs = displayState === "bill_printed" && table.timer_ended_at ? new Date(table.timer_ended_at).getTime() : nowMs;
  if (!Number.isFinite(endMs) || endMs < startMs) return "0m";
  const minutes = Math.floor((endMs - startMs) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
