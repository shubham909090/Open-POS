import { formatInr, getTableDisplayState, rankMenuQuickPicks, searchMenuItems, tableDisplayClass, tableDisplayLabel, type SaleGroupKind } from "@gaurav-pos/shared";
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
  const setOrderPanel = useHubStore((state) => state.setOrderPanel);
  const search = useHubStore((state) => state.menuSearch);
  const setSearch = useHubStore((state) => state.setMenuSearch);
  const recentMenuItemIds = useHubStore((state) => state.recentMenuItemIds);
  const addDraftItem = useHubStore((state) => state.addDraftItem);
  const [saleGroupFilter, setSaleGroupFilter] = useState<SaleGroupKind | "all">("all");
  const [unitFilter, setUnitFilter] = useState("");
  const selectedTable = bootstrap.tables.find((table) => table.id === selectedTableId) ?? bootstrap.tables.find((table) => table.active) ?? null;

  useEffect(() => {
    if (!selectedTableId && selectedTable) selectTable(selectedTable.id);
  }, [selectedTableId, selectedTable, selectTable]);

  const hasSearch = search.trim().length > 0;
  const searchFilters = {
    saleGroupKind: saleGroupFilter,
    productionUnitId: unitFilter || undefined
  };
  const quickPicks = hasSearch ? [] : rankMenuQuickPicks(bootstrap.menuItems, recentMenuItemIds, bootstrap.menuPopularity ?? [], searchFilters).slice(0, 10);
  const quickPickIds = new Set(quickPicks.map((pick) => pick.item.id));
  const activeItems = searchMenuItems(bootstrap.menuItems, search, searchFilters)
    .filter((item) => hasSearch || !quickPickIds.has(item.id));
  const saleGroupKinds = Array.from(new Map(bootstrap.saleGroups.filter((group) => group.active).map((group) => [group.kind, group.name])).entries());
  const openTablePanel = (tableId: string, panel: OrderPanel) => {
    selectTable(tableId);
    setOrderPanel(panel);
  };

  return (
    <div className="orders-grid">
      <section className="table-map panel">
        <div className="panel-title">
          <h2>Tables</h2>
          <span>{bootstrap.tables.filter((table) => table.active).length} active</span>
        </div>
        <div className="floor-table-list">
          {bootstrap.floors.filter((floor) => floor.active).map((floor) => {
            const floorTables = bootstrap.tables.filter((table) => table.active && table.floor_id === floor.id);
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
        </div>
      </section>

      <section className="menu-browser panel">
        <div className="panel-title">
          <h2>Menu</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dish" />
        </div>
        <div className="menu-filter-row" aria-label="Menu filters">
          <button type="button" className={saleGroupFilter === "all" ? "active" : ""} onClick={() => setSaleGroupFilter("all")}>All</button>
          {saleGroupKinds.map(([kind, label]) => (
            <button key={kind} type="button" className={saleGroupFilter === kind ? "active" : ""} onClick={() => setSaleGroupFilter(kind as SaleGroupKind)}>
              {label}
            </button>
          ))}
          <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} aria-label="Kitchen or counter filter">
            <option value="">All kitchens</option>
            {bootstrap.productionUnits.filter((unit) => unit.active).map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </select>
        </div>
        {selectedTable ? (
          <>
            {quickPicks.some((pick) => pick.section === "recent") ? (
              <MenuResultSection
                title="Recent"
                items={quickPicks.filter((pick) => pick.section === "recent").map((pick) => pick.item)}
                selectedTableId={selectedTable.id}
                onAdd={addDraftItem}
              />
            ) : null}
            {quickPicks.some((pick) => pick.section === "popular") ? (
              <MenuResultSection
                title="Popular today"
                items={quickPicks.filter((pick) => pick.section === "popular").map((pick) => pick.item)}
                selectedTableId={selectedTable.id}
                onAdd={addDraftItem}
              />
            ) : null}
            <MenuResultSection
              title={hasSearch ? "Best matches" : "All dishes"}
              items={activeItems}
              selectedTableId={selectedTable.id}
              onAdd={addDraftItem}
              emptyText={hasSearch ? "No dishes found. Check spelling or clear filters." : "No dishes found. Add active dishes in setup."}
            />
          </>
        ) : (
          <EmptyState title="Add a table first" description="Setup needs at least one active table before orders can start." />
        )}
      </section>

      <TableWorkspace tableId={selectedTable?.id ?? null} tableName={selectedTable?.name ?? ""} bootstrap={bootstrap} setNotice={setNotice} requestManagerApproval={requestManagerApproval} />
    </div>
  );
}
