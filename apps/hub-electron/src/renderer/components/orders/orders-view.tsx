import { formatInr, getTableDisplayState, searchMenuItems, tableDisplayClass, tableDisplayLabel, type SaleGroupKind, type TableDisplayState } from "@gaurav-pos/shared";
import { Clock3, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
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

/** A running table older than this gets a warning timer so forgotten checks stand out. */
const LONG_RUNNING_TABLE_MINUTES = 180;

type FloorFilter = "all" | "running" | "billed" | "free";

const floorFilters: Array<{ value: FloorFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "billed", label: "Billed" },
  { value: "free", label: "Free" }
];

const orderPanels: Array<{ value: OrderPanel; label: string }> = [
  { value: "new", label: "New order" },
  { value: "sent", label: "Sent items" },
  { value: "bill", label: "Bill" }
];

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
  const [floorFilter, setFloorFilter] = useState<FloorFilter>("all");
  const [menuOpen, setMenuOpen] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const tableTriggerRef = useRef<HTMLElement | null>(null);
  const activeTables = bootstrap.tables.filter((table) => table.active);
  const selectedTable = activeTables.find((table) => table.id === selectedTableId) ?? null;
  const selectedTableDuration = selectedTable ? formatTableDuration(selectedTable, nowMs) : null;
  const selectedTableState = selectedTable ? getTableDisplayState(selectedTable) : null;

  const counts = {
    all: activeTables.length,
    running: activeTables.filter((table) => getTableDisplayState(table) === "running").length,
    billed: activeTables.filter((table) => getTableDisplayState(table) === "bill_printed").length,
    free: activeTables.filter((table) => getTableDisplayState(table) === "free").length
  };
  const onTablesPaise = activeTables
    .filter((table) => table.current_order_id && getTableDisplayState(table) !== "free")
    .reduce((total, table) => total + table.current_order_total_paise, 0);

  const saleGroupKinds = Array.from(new Map(bootstrap.saleGroups.filter((group) => group.active).map((group) => [group.kind, group.name])).entries());
  const preferredSaleGroup = (["food", "beverage", "alcohol", "other"] as SaleGroupKind[]).find((kind) =>
    saleGroupKinds.some(([saleGroupKind]) => saleGroupKind === kind) &&
    bootstrap.menuItems.some((item) => item.active && item.sale_group_kind === kind)
  );
  const activeSaleGroup = saleGroupFilter ?? preferredSaleGroup ?? (saleGroupKinds[0]?.[0] as SaleGroupKind | undefined);
  const hasSearch = search.trim().length > 0;
  // A search looks across every group; tabs only narrow an empty search.
  const activeItems = searchMenuItems(bootstrap.menuItems, search, hasSearch ? {} : { saleGroupKind: activeSaleGroup }).slice(0, 80);
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
  const selectedDraftCounts = new Map<string, number>();
  for (const item of Object.values(selectedTable ? drafts[selectedTable.id] ?? {} : {})) {
    if (item.menuItemId) selectedDraftCounts.set(item.menuItemId, (selectedDraftCounts.get(item.menuItemId) ?? 0) + item.quantity);
  }
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

  const matchesFilter = (state: TableDisplayState, hasDraft: boolean) => {
    if (floorFilter === "all") return true;
    if (floorFilter === "running") return state === "running" || state === "needs_attention" || hasDraft;
    if (floorFilter === "billed") return state === "bill_printed";
    return state === "free" && !hasDraft;
  };

  return (
    <div className="floor-view">
      <div className="floor-toolbar">
        <div className="floor-filter" role="group" aria-label="Show tables">
          {floorFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`floor-filter-chip ${filter.value}${floorFilter === filter.value ? " active" : ""}`}
              aria-pressed={floorFilter === filter.value}
              aria-label={`${filter.label} ${counts[filter.value]}`}
              onClick={() => setFloorFilter(filter.value)}
            >
              <span>{filter.label}</span>
              <b>{counts[filter.value]}</b>
            </button>
          ))}
        </div>
        {onTablesPaise > 0 ? (
          <p className="floor-open-value" aria-label={`Open on tables ${formatInr(onTablesPaise)}`}>
            <span>Open on tables</span>
            <strong>{formatInr(onTablesPaise)}</strong>
          </p>
        ) : null}
      </div>
      <div className="floor-table-list">
        {bootstrap.floors.filter((floor) => floor.active).map((floor) => {
          const floorTables = sortTables(activeTables.filter((table) => table.floor_id === floor.id), tableOrderMode);
          if (!floorTables.length) return null;
          const liveCount = floorTables.filter((table) => getTableDisplayState(table) !== "free").length;
          const visibleTables = floorTables.filter((table) => {
            const hasDraft = Object.values(drafts[table.id] ?? {}).some((item) => item.quantity > 0);
            return matchesFilter(getTableDisplayState(table), getTableDisplayState(table) === "free" && hasDraft);
          });
          if (!visibleTables.length) return null;
          return (
            <section className="floor-group" key={floor.id} aria-labelledby={`floor-${floor.id}`}>
              <header className="floor-group-header">
                <h3 id={`floor-${floor.id}`}>{floor.name}</h3>
                <span>{liveCount ? `${liveCount} live · ${floorTables.length}` : floorTables.length}</span>
              </header>
              <div className="table-list">
                {visibleTables.map((table) => {
                  const displayState = getTableDisplayState(table);
                  const tableDraft = Object.values(drafts[table.id] ?? {});
                  const draftQuantity = tableDraft.reduce((total, item) => total + item.quantity, 0);
                  const draftTotal = tableDraft.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
                  const hasLocalDraftWarning = displayState === "free" && draftQuantity > 0;
                  const isLiveTable = Boolean(table.current_order_id) && displayState !== "free";
                  const duration = formatTableDuration(table, nowMs);
                  const longRunning = displayState === "running" && tableMinutes(table, nowMs) >= LONG_RUNNING_TABLE_MINUTES;
                  const tileClass = [
                    "table-tile",
                    hasLocalDraftWarning ? "draft-warning" : tableDisplayClass(displayState),
                    isLiveTable || hasLocalDraftWarning ? "live" : "",
                    longRunning ? "long-running" : "",
                    table.id === selectedTable?.id ? "active" : ""
                  ].filter(Boolean).join(" ");
                  return (
                    <article key={table.id} className={tileClass}>
                      <button
                        type="button"
                        className="table-tile-main"
                        aria-label={`Open table ${table.name}, ${hasLocalDraftWarning ? `${draftQuantity} unsent items` : tableDisplayLabel(displayState)}${duration ? displayState === "bill_printed" ? `, ${duration}` : `, open for ${duration}` : ""}`}
                        onClick={() => openTablePanel(table.id, "new")}
                      >
                        <span className="table-tile-topline">
                          <strong className="table-tile-name">{table.name}</strong>
                          {duration ? (
                            <span className="table-tile-duration" title={duration} aria-hidden="true">
                              {displayState !== "bill_printed" ? <Clock3 size={11} strokeWidth={2.2} /> : null}
                              <span>{displayState === "bill_printed" ? duration.replace(/^Billed /, "").replace(/(\d+)h \d+m/, "$1h") : duration}</span>
                            </span>
                          ) : null}
                        </span>
                        {isLiveTable || hasLocalDraftWarning ? (
                          <span className="table-tile-meta">
                            <span className="table-tile-state">
                              {hasLocalDraftWarning ? `Draft ${draftQuantity} ${draftQuantity === 1 ? "item" : "items"}` : tileStateLabel(displayState)}
                            </span>
                            <b className="table-tile-total">{formatTileInr(hasLocalDraftWarning ? draftTotal : table.current_order_total_paise)}</b>
                          </span>
                        ) : null}
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
            </section>
          );
        })}
        {!activeTables.length ? <EmptyState title="Add a table first" description="Setup needs at least one active table before orders can start." /> : null}
        {activeTables.length > 0 && floorFilter !== "all" && counts[floorFilter] === 0 ? (
          <p className="floor-filter-empty">No {floorFilter} tables right now.</p>
        ) : null}
      </div>

      {selectedTable ? (
        <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) clearSelectedTable(); }}>
          <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="modal-backdrop order-modal-backdrop" />
          <DialogPrimitive.Content className="order-modal-card" aria-label={`${selectedTable.name} order workspace`} onPointerDownOutside={(event) => event.preventDefault()} onOpenAutoFocus={(event) => {
            // Panels that autofocus their own field (menu search) keep it; others start on the
            // workspace itself instead of ringing the first header tab.
            event.preventDefault();
            const content = event.currentTarget;
            if (content instanceof HTMLElement && !content.contains(document.activeElement)) content.focus({ preventScroll: true });
          }} onCloseAutoFocus={(event) => {
            if (tableTriggerRef.current?.isConnected) {
              event.preventDefault();
              tableTriggerRef.current.focus();
            }
          }}>
            <header className={`order-modal-header state-${selectedTableState ? tableDisplayClass(selectedTableState) : "free"}`}>
              <div className="order-modal-title">
                <DialogPrimitive.Title asChild><h2>{selectedTable.name}<span className="sr-only"> order workspace</span></h2></DialogPrimitive.Title>
                <span className="order-modal-meta">
                  <span>{selectedTable.floor_name}</span>
                  <span className="order-modal-state">{selectedTableState ? tileStateLabel(selectedTableState) : "Free"}</span>
                  {selectedTableDuration ? (
                    <span className="order-modal-duration" aria-label={`${selectedTable.name} open for ${selectedTableDuration}`}>
                      <Clock3 size={12} aria-hidden="true" />
                      {selectedTableDuration}
                    </span>
                  ) : null}
                </span>
                <DialogPrimitive.Description className="sr-only">Add items, review kitchen tickets and settle this table's bill.</DialogPrimitive.Description>
              </div>
              <div className="order-panel-tabs" role="group" aria-label={`${selectedTable.name} order panels`}>
                {orderPanels.map((panel) => (
                  <button
                    key={panel.value}
                    type="button"
                    aria-pressed={orderPanel === panel.value}
                    className={orderPanel === panel.value ? "active" : ""}
                    onClick={() => setOrderPanel(panel.value)}
                  >
                    {panel.label}
                    {panel.value === "sent" && selectedTable.sent_item_count > 0 ? <span className="order-panel-count" aria-hidden="true">{selectedTable.sent_item_count}</span> : null}
                  </button>
                ))}
              </div>
              <div className="order-modal-actions">
                {orderPanel === "new" ? <button
                  type="button"
                  className="order-header-icon"
                  aria-label={menuOpen ? "Hide menu" : "Open menu"}
                  title={menuOpen ? "Hide menu" : "Open menu"}
                  aria-pressed={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  {menuOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
                </button> : null}
                <button type="button" className="order-header-icon" onClick={clearSelectedTable} aria-label="Close selected table" title="Close (Esc)">
                  <X size={18} />
                </button>
              </div>
            </header>
            <div className={menuOpen ? "order-modal-layout menu-open" : "order-modal-layout menu-closed"}>
              {menuOpen ? (
                <section className="menu-browser order-menu-panel" aria-label="Menu">
                  <div className="menu-browser-head">
                    <label className="menu-search">
                      <Search size={15} aria-hidden="true" />
                      <input
                        autoFocus
                        aria-label="Search dishes"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={menuKeyboard.onKeyDown}
                        placeholder="Search dish"
                      />
                      {hasSearch ? (
                        <button type="button" className="menu-search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
                          <X size={14} />
                        </button>
                      ) : null}
                    </label>
                    <div className="menu-filter-row" role="group" aria-label="Menu filters">
                      {saleGroupKinds.map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          aria-pressed={!hasSearch && activeSaleGroup === kind}
                          className={`menu-filter-chip category-${kind}${!hasSearch && activeSaleGroup === kind ? " active" : ""}`}
                          onClick={() => { setSaleGroupFilter(kind as SaleGroupKind); if (hasSearch) setSearch(""); }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <MenuResultSection
                    title={hasSearch ? `${activeItems.length} ${activeItems.length === 1 ? "match" : "matches"}` : (saleGroupKinds.find(([kind]) => kind === activeSaleGroup)?.[1] ?? "Menu")}
                    items={activeItems}
                    mixed={hasSearch}
                    draftCounts={selectedDraftCounts}
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

// Tiles are narrow; "Billed" matches the filter wording. Screen readers get the full label from the button.
function tileStateLabel(state: TableDisplayState): string {
  return state === "bill_printed" ? "Billed" : tableDisplayLabel(state);
}

/** Tiles drop zero paise ("₹540", "₹3,220.50") so the amount fits beside the state. */
function formatTileInr(paise: number): string {
  return formatInr(paise).replace(/\.00$/, "");
}

function tableMinutes(table: Pick<Bootstrap["tables"][number], "occupied_at">, nowMs: number): number {
  if (!table.occupied_at) return 0;
  const startMs = new Date(table.occupied_at).getTime();
  return Number.isFinite(startMs) ? Math.max(0, Math.floor((nowMs - startMs) / 60_000)) : 0;
}

export function formatTableDuration(table: Pick<Bootstrap["tables"][number], "occupied_at" | "timer_ended_at" | "status">, nowMs = Date.now()): string | null {
  const billed = getTableDisplayState(table) === "bill_printed";
  const timestamp = billed ? table.timer_ended_at : table.occupied_at;
  if (!timestamp) return null;
  const startMs = new Date(timestamp).getTime();
  if (!Number.isFinite(startMs)) return null;
  const minutes = Math.max(0, Math.floor((nowMs - startMs) / 60_000));
  const duration = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return billed ? `Billed ${duration} ago` : duration;
}
