import { formatInr, getTableDisplayState, searchMenuItems, tableDisplayClass, tableDisplayLabel, type SaleGroupKind } from "@gaurav-pos/shared";
import { PanelLeftOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { NoticeSetter } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import type { Bootstrap } from "../../hub-api.js";
import { useHubStore, type OrderPanel } from "../../store.js";
import { EmptyState } from "../ui/empty-state.js";
import { MenuResultSection } from "./menu-card.js";
import { TableWorkspace } from "./table-workspace.js";

export function OrdersView({ bootstrap, setNotice, requestManagerApproval }: { bootstrap: Bootstrap; setNotice: NoticeSetter; requestManagerApproval: ManagerApprovalRequest }) {
  const selectedTableId = useHubStore((state) => state.selectedTableId);
  const selectTable = useHubStore((state) => state.selectTable);
  const clearSelectedTable = useHubStore((state) => state.clearSelectedTable);
  const setOrderPanel = useHubStore((state) => state.setOrderPanel);
  const search = useHubStore((state) => state.menuSearch);
  const setSearch = useHubStore((state) => state.setMenuSearch);
  const addDraftItem = useHubStore((state) => state.addDraftItem);
  const [saleGroupFilter, setSaleGroupFilter] = useState<SaleGroupKind | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeTables = bootstrap.tables.filter((table) => table.active);
  const selectedTable = activeTables.find((table) => table.id === selectedTableId) ?? null;

  const saleGroupKinds = Array.from(new Map(bootstrap.saleGroups.filter((group) => group.active).map((group) => [group.kind, group.name])).entries());
  const preferredSaleGroup = (["food", "beverage", "alcohol", "other"] as SaleGroupKind[]).find((kind) =>
    saleGroupKinds.some(([saleGroupKind]) => saleGroupKind === kind) &&
    bootstrap.menuItems.some((item) => item.active && item.sale_group_kind === kind)
  );
  const activeSaleGroup = saleGroupFilter ?? preferredSaleGroup ?? (saleGroupKinds[0]?.[0] as SaleGroupKind | undefined);
  const hasSearch = search.trim().length > 0;
  const activeItems = searchMenuItems(bootstrap.menuItems, search, { saleGroupKind: activeSaleGroup }).slice(0, 80);
  const openTablePanel = (tableId: string, panel: OrderPanel) => {
    selectTable(tableId);
    setOrderPanel(panel);
  };

  useEffect(() => {
    if (selectedTable) setMenuOpen(false);
  }, [selectedTable?.id]);

  return (
    <div className="orders-grid tables-first">
      <section className="table-map panel">
        <div className="panel-title">
          <div>
            <h2>Tables</h2>
            <span>Tap a table to open its order workspace</span>
          </div>
          <div className="table-map-counts" aria-label="Table state counts">
            <span className="state-dot free">{activeTables.filter((table) => getTableDisplayState(table) === "free").length} free</span>
            <span className="state-dot running">{activeTables.filter((table) => getTableDisplayState(table) === "running").length} running</span>
            <span className="state-dot billed">{activeTables.filter((table) => getTableDisplayState(table) === "bill_printed").length} billed</span>
          </div>
        </div>
        <div className="floor-table-list">
          {bootstrap.floors.filter((floor) => floor.active).map((floor) => {
            const floorTables = activeTables.filter((table) => table.floor_id === floor.id);
            if (!floorTables.length) return null;
            return (
              <div className="floor-group" key={floor.id}>
                <h3>{floor.name}</h3>
                <div className="table-list">
                  {floorTables.map((table) => {
                    const displayState = getTableDisplayState(table);
                    const isLiveTable = table.current_order_id && displayState !== "free";
                    return (
                      <article
                        key={table.id}
                        className={
                          table.id === selectedTable?.id
                            ? `table-tile ${tableDisplayClass(displayState)} active`
                            : `table-tile ${tableDisplayClass(displayState)}`
                        }
                      >
                        <button type="button" className="table-tile-main" onClick={() => openTablePanel(table.id, "new")}>
                          <span className="table-tile-heading">
                            <strong>{table.name}</strong>
                            <span>{tableDisplayLabel(displayState)}</span>
                          </span>
                          {isLiveTable ? <b className="table-tile-total">{formatInr(table.current_order_total_paise)}</b> : null}
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
        <div className="modal-backdrop order-modal-backdrop" role="presentation">
          <section className="order-modal-card" role="dialog" aria-modal="true" aria-label={`${selectedTable.name} order workspace`}>
            <header className="order-modal-header">
              <div>
                <span>{selectedTable.floor_name}</span>
                <h2>{selectedTable.name}</h2>
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
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dish" />
                    </div>
                  </div>
                  <div className="menu-filter-row" aria-label="Menu filters">
                    {saleGroupKinds.map(([kind, label]) => (
                      <button key={kind} type="button" className={activeSaleGroup === kind ? "active" : ""} onClick={() => setSaleGroupFilter(kind as SaleGroupKind)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <MenuResultSection
                    title={hasSearch ? "Best matches" : (saleGroupKinds.find(([kind]) => kind === activeSaleGroup)?.[1] ?? "Menu")}
                    items={activeItems}
                    selectedTableId={selectedTable.id}
                    onAdd={addDraftItem}
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
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
