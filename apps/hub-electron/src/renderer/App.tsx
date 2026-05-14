import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInr, getTableDisplayState, tableDisplayClass, tableDisplayLabel } from "@gaurav-pos/shared";
import {
  BadgeIndianRupee,
  CalendarCheck,
  ChefHat,
  ClipboardList,
  CloudDownload,
  LayoutDashboard,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Users,
  X
} from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { hubApi, setAuthToken, getAuthToken, type Bootstrap, type Floor, type MenuItem, type ProductionUnit, type Table, type TableOrder } from "./hub-api.js";
import { useHubStore, type HubView } from "./store.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3_000,
      retry: 1,
      refetchOnWindowFocus: true
    }
  }
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HubShell />
    </QueryClientProvider>
  );
}

function HubShell() {
  const [token, setToken] = useState(getAuthToken());
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const view = useHubStore((state) => state.view);
  const setView = useHubStore((state) => state.setView);
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: hubApi.bootstrap });

  function saveToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthToken(token);
    void queryClient.invalidateQueries();
    setNotice({ tone: "good", text: "Hub unlocked on this device." });
  }

  return (
    <main className="hub-shell">
      <aside className="side-rail">
        <div className="brand-block">
          <span>Gaurav POS</span>
          <strong>Hub</strong>
        </div>
        <nav className="nav-stack" aria-label="Hub sections">
          <NavButton icon={<LayoutDashboard size={18} />} label="Setup" view="setup" active={view === "setup"} onClick={setView} />
          <NavButton icon={<ReceiptText size={18} />} label="Take Orders" view="orders" active={view === "orders"} onClick={setView} />
          <NavButton icon={<ChefHat size={18} />} label="Kitchen" view="kitchen" active={view === "kitchen"} onClick={setView} />
          <NavButton icon={<BadgeIndianRupee size={18} />} label="Reports" view="reports" active={view === "reports"} onClick={setView} />
          <NavButton icon={<Settings size={18} />} label="Advanced" view="advanced" active={view === "advanced"} onClick={setView} />
        </nav>
        <form className="unlock-card" onSubmit={saveToken}>
          <label>
            Hub password
            <input value={token} onChange={(event) => setToken(event.target.value)} type="password" />
          </label>
          <button type="submit">
            <Save size={16} />
            Save
          </button>
        </form>
      </aside>

      <section className="hub-main">
        <header className="topbar">
          <div>
            <p>{bootstrap.data?.openDay ? `POS day open: ${bootstrap.data.openDay.business_date}` : "No POS day open"}</p>
            <h1>{titleForView(view)}</h1>
          </div>
          <div className="topbar-actions">
            <span className={bootstrap.data?.setup?.printerDryRun ? "status-pill warn" : "status-pill"}>{bootstrap.data?.setup?.printerDryRun ? "Printer test mode" : "Printers live"}</span>
            <span className="status-pill">Sync pending {bootstrap.data?.syncStatus?.counts?.pending ?? 0}</span>
            <button type="button" className="icon-button" onClick={() => void bootstrap.refetch()} aria-label="Refresh">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {notice ? <div className={`notice ${notice.tone}`}>{notice.text}</div> : null}
        {bootstrap.error ? <div className="notice bad">{messageOf(bootstrap.error)}</div> : null}
        {bootstrap.isLoading ? <div className="loading-panel">Loading hub data...</div> : null}

        {bootstrap.data ? (
          <>
            {view === "setup" ? <SetupView bootstrap={bootstrap.data} setNotice={setNotice} /> : null}
            {view === "orders" ? <OrdersView bootstrap={bootstrap.data} setNotice={setNotice} /> : null}
            {view === "kitchen" ? <KitchenView bootstrap={bootstrap.data} setNotice={setNotice} /> : null}
            {view === "reports" ? <ReportsView setNotice={setNotice} /> : null}
            {view === "advanced" ? <AdvancedView bootstrap={bootstrap.data} setNotice={setNotice} /> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}

function NavButton({
  icon,
  label,
  view,
  active,
  onClick
}: {
  icon: ReactNode;
  label: string;
  view: HubView;
  active: boolean;
  onClick: (view: HubView) => void;
}) {
  return (
    <button type="button" className={active ? "nav-button active" : "nav-button"} onClick={() => onClick(view)}>
      {icon}
      {label}
    </button>
  );
}

function SetupView({ bootstrap, setNotice }: { bootstrap: Bootstrap; setNotice: NoticeSetter }) {
  const queryClient = useQueryClient();
  const [openingCash, setOpeningCash] = useState("0");
  const [floorName, setFloorName] = useState("");
  const [tableName, setTableName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [dishName, setDishName] = useState("");
  const [dishPrice, setDishPrice] = useState("");
  const [dishUnit, setDishUnit] = useState("");
  const [dishGroup, setDishGroup] = useState("sg-food");
  const [tableFloorId, setTableFloorId] = useState("");
  const firstFloorId = bootstrap.floors.find((floor) => floor.active)?.id ?? bootstrap.floors[0]?.id ?? "";
  const activeFloors = bootstrap.floors.filter((floor) => floor.active);
  const dishPricePaise = Math.round(Number(dishPrice || 0) * 100);

  useEffect(() => {
    if (!tableFloorId || !bootstrap.floors.some((floor) => floor.id === tableFloorId && floor.active)) {
      setTableFloorId(firstFloorId);
    }
  }, [bootstrap.floors, firstFloorId, tableFloorId]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  const openDay = useMutation({
    mutationFn: () => hubApi.openDay(Math.round(Number(openingCash || 0) * 100)),
    onSuccess: async () => {
      await invalidate();
      setNotice({ tone: "good", text: "POS day opened. You can take orders now." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const createFloor = useMutation({
    mutationFn: () => hubApi.createFloor(floorName),
    onSuccess: async () => {
      setFloorName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const createTable = useMutation({
    mutationFn: () => hubApi.createTable(tableFloorId || firstFloorId, tableName),
    onSuccess: async () => {
      setTableName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const createUnit = useMutation({
    mutationFn: () => hubApi.createUnit(unitName),
    onSuccess: async () => {
      setUnitName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const createDish = useMutation({
    mutationFn: () =>
      hubApi.createDish({
        name: dishName,
        pricePaise: dishPricePaise,
        productionUnitId: dishUnit || null,
        saleGroupId: dishGroup,
        active: true
      }),
    onSuccess: async () => {
      setDishName("");
      setDishPrice("");
      setDishUnit("");
      setDishGroup("sg-food");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  return (
    <div className="setup-board">
      <SetupCard title="Open Today's POS Day" done={Boolean(bootstrap.openDay)} icon={<CalendarCheck size={20} />}>
        {bootstrap.openDay ? (
          <p className="plain-state">Open since {bootstrap.openDay.business_date}. You do not repeat setup every day, only open and close the day.</p>
        ) : (
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); openDay.mutate(); }}>
            <label>
              Opening cash
              <input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} inputMode="decimal" />
            </label>
            <button disabled={openDay.isPending} type="submit">Open day</button>
          </form>
        )}
      </SetupCard>

      <SetupCard title="Floors And Tables" done={bootstrap.tables.some((table) => table.active)} icon={<Users size={20} />}>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); createFloor.mutate(); }}>
          <label>
            Floor name
            <input value={floorName} onChange={(event) => setFloorName(event.target.value)} placeholder="Main hall" />
          </label>
          <button disabled={!floorName.trim() || createFloor.isPending} type="submit">Add floor</button>
        </form>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); createTable.mutate(); }}>
          <label>
            Floor
            <select value={tableFloorId} onChange={(event) => setTableFloorId(event.target.value)}>
              {activeFloors.map((floor) => (
                <option key={floor.id} value={floor.id}>{floor.name}</option>
              ))}
            </select>
          </label>
          <label>
            Table name
            <input value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="T1" />
          </label>
          <button disabled={!firstFloorId || !tableName.trim() || createTable.isPending} type="submit">Add table</button>
        </form>
        <EditableRecordList
          setNotice={setNotice}
          rows={bootstrap.tables.map((table) => ({
            id: table.id,
            title: table.name,
            meta: `${table.floor_name} · ${table.active ? table.status : "disabled"}`,
            active: table.active,
            onToggle: () => hubApi.updateTable(table.id, { active: !table.active }).then(invalidate),
            onDelete: () => hubApi.deleteTable(table.id).then(invalidate),
            editForm: (close) => (
              <TableEditForm table={table} floors={activeFloors} onSaved={async () => { close(); await invalidate(); }} setNotice={setNotice} />
            )
          }))}
        />
        <EditableRecordList
          setNotice={setNotice}
          rows={bootstrap.floors.map((floor) => ({
            id: floor.id,
            title: floor.name,
            meta: floor.active ? "Floor active" : "Floor disabled",
            active: floor.active,
            onToggle: () => hubApi.updateFloor(floor.id, { active: !floor.active }).then(invalidate),
            onDelete: () => hubApi.deleteFloor(floor.id).then(invalidate),
            editForm: (close) => (
              <FloorEditForm floor={floor} onSaved={async () => { close(); await invalidate(); }} setNotice={setNotice} />
            )
          }))}
        />
      </SetupCard>

      <SetupCard title="Kitchens And Counters" done={bootstrap.productionUnits.some((unit) => unit.active)} icon={<ChefHat size={20} />}>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); createUnit.mutate(); }}>
          <label>
            Kitchen or counter name
            <input value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="Main kitchen" />
          </label>
          <button disabled={!unitName.trim() || createUnit.isPending} type="submit">Add</button>
        </form>
        <EditableRecordList
          setNotice={setNotice}
          rows={bootstrap.productionUnits.map((unit) => ({
            id: unit.id,
            title: unit.name,
            meta: unit.active ? "Active" : "Disabled",
            active: unit.active,
            onToggle: () => hubApi.updateUnit(unit.id, { active: !unit.active }).then(invalidate),
            onDelete: () => hubApi.deleteUnit(unit.id).then(invalidate),
            editForm: (close) => (
              <UnitEditForm unit={unit} onSaved={async () => { close(); await invalidate(); }} setNotice={setNotice} />
            )
          }))}
        />
      </SetupCard>

      <SetupCard title="Dishes" done={bootstrap.menuItems.some((item) => item.active)} icon={<ClipboardList size={20} />}>
        <form className="dish-form" onSubmit={(event) => { event.preventDefault(); createDish.mutate(); }}>
          <label>
            Dish name
            <input value={dishName} onChange={(event) => setDishName(event.target.value)} placeholder="Paneer tikka" />
          </label>
          <label>
            Price
            <input value={dishPrice} onChange={(event) => setDishPrice(event.target.value)} inputMode="decimal" placeholder="220" />
          </label>
          <label>
            Kitchen
            <select value={dishUnit} onChange={(event) => setDishUnit(event.target.value)}>
              <option value="">No kitchen yet</option>
              {bootstrap.productionUnits.filter((unit) => unit.active).map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </label>
          <label>
            Group
            <select value={dishGroup} onChange={(event) => setDishGroup(event.target.value)}>
              {bootstrap.saleGroups.filter((group) => group.active).map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
          <button disabled={!dishName.trim() || dishPricePaise <= 0 || createDish.isPending} type="submit">Add dish</button>
        </form>
        <EditableRecordList
          setNotice={setNotice}
          rows={bootstrap.menuItems.map((item) => ({
            id: item.id,
            title: item.name,
            meta: `${formatInr(item.price_paise)} · ${item.sale_group_name} · ${item.production_unit_name ?? "No kitchen assigned"} · ${item.active ? "active" : "disabled"}`,
            active: item.active,
            onToggle: () => hubApi.updateDish(item.id, { active: !item.active }).then(invalidate),
            onDelete: () => hubApi.deleteDish(item.id).then(invalidate),
            editForm: (close) => (
              <DishEditForm item={item} units={bootstrap.productionUnits.filter((unit) => unit.active)} saleGroups={bootstrap.saleGroups.filter((group) => group.active)} onSaved={async () => { close(); await invalidate(); }} setNotice={setNotice} />
            )
          }))}
        />
      </SetupCard>
    </div>
  );
}

function OrdersView({ bootstrap, setNotice }: { bootstrap: Bootstrap; setNotice: NoticeSetter }) {
  const selectedTableId = useHubStore((state) => state.selectedTableId);
  const selectTable = useHubStore((state) => state.selectTable);
  const search = useHubStore((state) => state.menuSearch);
  const setSearch = useHubStore((state) => state.setMenuSearch);
  const addDraftItem = useHubStore((state) => state.addDraftItem);
  const selectedTable = bootstrap.tables.find((table) => table.id === selectedTableId) ?? bootstrap.tables.find((table) => table.active) ?? null;

  useEffect(() => {
    if (!selectedTableId && selectedTable) selectTable(selectedTable.id);
  }, [selectedTableId, selectedTable, selectTable]);

  const activeItems = bootstrap.menuItems
    .filter((item) => item.active)
    .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

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
                  {floorTables.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      className={
                        table.id === selectedTable?.id
                          ? `table-tile ${tableDisplayClass(getTableDisplayState(table))} active`
                          : `table-tile ${tableDisplayClass(getTableDisplayState(table))}`
                      }
                      onClick={() => selectTable(table.id)}
                    >
                      <strong>{table.name}</strong>
                      <span>{tableDisplayLabel(getTableDisplayState(table))}</span>
                    </button>
                  ))}
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
        {selectedTable ? (
          <div className="menu-grid">
            {activeItems.map((item) => (
              <MenuCard key={item.id} item={item} onAdd={() => addDraftItem(selectedTable.id, item)} />
            ))}
          </div>
        ) : (
          <Empty title="Add a table first" text="Setup needs at least one active table before orders can start." />
        )}
      </section>

      <TableWorkspace tableId={selectedTable?.id ?? null} tableName={selectedTable?.name ?? ""} bootstrap={bootstrap} setNotice={setNotice} />
    </div>
  );
}

function MenuCard({ item, onAdd }: { item: MenuItem; onAdd: () => void }) {
  return (
    <article className="menu-card">
      <div>
        <strong>{item.name}</strong>
        <span>{item.production_unit_name ?? "No kitchen assigned"}</span>
      </div>
      <footer>
        <b>{formatInr(item.price_paise)}</b>
        <button type="button" onClick={onAdd} aria-label={`Add ${item.name}`}>
          <Plus size={18} />
        </button>
      </footer>
    </article>
  );
}

function TableWorkspace({ tableId, tableName, bootstrap, setNotice }: { tableId: string | null; tableName: string; bootstrap: Bootstrap; setNotice: NoticeSetter }) {
  const queryClient = useQueryClient();
  const orderPanel = useHubStore((state) => state.orderPanel);
  const setOrderPanel = useHubStore((state) => state.setOrderPanel);
  const drafts = useHubStore((state) => state.drafts);
  const addOpenDraftItem = useHubStore((state) => state.addOpenDraftItem);
  const changeDraftQty = useHubStore((state) => state.changeDraftQty);
  const clearDraft = useHubStore((state) => state.clearDraft);
  const [guests, setGuests] = useState("2");
  const [openName, setOpenName] = useState("");
  const [openPrice, setOpenPrice] = useState("");
  const [openGroup, setOpenGroup] = useState("sg-food");
  const [openUnit, setOpenUnit] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [managerReason, setManagerReason] = useState("");
  const [shiftTargetTableId, setShiftTargetTableId] = useState("");
  const draft = tableId ? Object.values(drafts[tableId] ?? {}) : [];
  const tableOrder = useQuery({
    queryKey: ["tableOrder", tableId],
    queryFn: () => hubApi.tableOrder(tableId as string),
    enabled: Boolean(tableId)
  });
  const data = tableOrder.data;
  const sentItems = (data?.items ?? []).filter((item) => item.status !== "cancelled" && item.quantity > 0);
  const shiftTargets = bootstrap.tables.filter((table) => table.active && table.id !== tableId && table.status === "free");
  const draftTotal = draft.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
  const sentTotal = sentItems.reduce((total, item) => total + item.unit_price_paise * item.quantity, 0);

  const refreshTable = async () => {
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    await queryClient.invalidateQueries({ queryKey: ["tableOrder", tableId] });
  };

  const submitOrder = useMutation({
    mutationFn: () => {
      if (!tableId || draft.length === 0) throw new Error("Add at least one new dish before sending to kitchen.");
      return hubApi.submitOrder({
        tableId,
        pax: Number(guests || 1),
        items: draft.map((item) =>
          item.openName
            ? {
                openName: item.openName,
                openPricePaise: item.pricePaise,
                saleGroupId: item.saleGroupId ?? "sg-food",
                productionUnitId: item.productionUnitId ?? null,
                quantity: item.quantity
              }
            : { menuItemId: item.menuItemId, quantity: item.quantity }
        )
      });
    },
    onSuccess: async () => {
      if (tableId) clearDraft(tableId);
      await refreshTable();
      setOrderPanel("sent");
      setNotice({ tone: "good", text: "Sent to kitchen. New item list is clear now." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  const generateBill = useMutation({
    mutationFn: () => {
      const orderId = data?.order?.id;
      if (!orderId) throw new Error("No active order to bill.");
      return hubApi.generateBill(orderId);
    },
    onSuccess: async () => {
      await refreshTable();
      setOrderPanel("bill");
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  const cancelOrder = useMutation({
    mutationFn: () => {
      const orderId = data?.order?.id;
      if (!orderId) throw new Error("No active order to cancel.");
      return hubApi.cancelOrder(orderId, { managerApproval: { pin: managerPin, reason: managerReason || "Order cancelled", approvedBy: "manager" } });
    },
    onSuccess: async () => {
      if (tableId) clearDraft(tableId);
      setManagerPin("");
      setManagerReason("");
      await refreshTable();
      setOrderPanel("new");
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const shiftItem = useMutation({
    mutationFn: (itemId: string) => {
      if (!tableId || !shiftTargetTableId) throw new Error("Choose a free target table first.");
      return hubApi.moveItems({
        fromTableId: tableId,
        toTableId: shiftTargetTableId,
        reason: "Items shifted from hub",
        items: [{ orderItemId: itemId, quantity: 1 }]
      });
    },
    onSuccess: async () => {
      await refreshTable();
      setNotice({ tone: "good", text: "Item shifted to the selected table." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  if (!tableId) {
    return (
      <section className="ticket-workspace panel">
        <Empty title="No table selected" text="Choose or add a table before taking an order." />
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
        <div className="total-chip">{formatInr(draftTotal + sentTotal)}</div>
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
            <button type="button" disabled={draft.length === 0 || submitOrder.isPending} onClick={() => submitOrder.mutate()}>
              {submitOrder.isPending ? "Sending..." : "Send to kitchen"}
            </button>
          </div>
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
              id: item.menuItemId,
              title: item.name,
              meta: `${formatInr(item.pricePaise)} each`,
              quantity: item.quantity,
              amount: item.pricePaise * item.quantity,
              onMinus: () => changeDraftQty(tableId, item.menuItemId, -1),
              onPlus: () => changeDraftQty(tableId, item.menuItemId, 1)
            }))}
          />
        </div>
      ) : null}

      {orderPanel === "sent" ? (
        <div className="ticket-section">
          <LineItems
            emptyTitle="Nothing sent yet"
            emptyText="After Send to kitchen succeeds, server-confirmed items appear here."
            rows={sentItems.map((item) => ({
              id: item.id,
              title: item.name_snapshot,
              meta: `${formatInr(item.unit_price_paise)} each · ${item.production_unit_name ?? "No kitchen assigned"}`,
              quantity: item.quantity,
              amount: item.unit_price_paise * item.quantity
            }))}
          />
          {data?.order ? (
            <div className="shift-panel">
              <label>
                Shift one item to
                <select value={shiftTargetTableId} onChange={(event) => setShiftTargetTableId(event.target.value)}>
                  <option value="">Choose free table</option>
                  {shiftTargets.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                </select>
              </label>
              <div className="shift-actions">
                {sentItems.map((item) => (
                  <button key={item.id} type="button" disabled={!shiftTargetTableId || shiftItem.isPending} onClick={() => shiftItem.mutate(item.id)}>
                    Move 1 x {item.name_snapshot}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {data?.order ? (
            <ManagerApprovalBox
              title="Cancel running order"
              pin={managerPin}
              reason={managerReason}
              onPin={setManagerPin}
              onReason={setManagerReason}
              buttonLabel={cancelOrder.isPending ? "Cancelling..." : "Cancel order"}
              danger
              disabled={cancelOrder.isPending || managerPin.length < 4 || managerReason.trim().length < 3}
              onSubmit={() => cancelOrder.mutate()}
            />
          ) : null}
        </div>
      ) : null}

      {orderPanel === "bill" ? (
        <BillingPanel
          tableOrder={data}
          menuItems={bootstrap.menuItems}
          sentTotal={sentTotal}
          generateBill={() => generateBill.mutate()}
          generating={generateBill.isPending || tableOrder.isFetching}
          onSettled={refreshTable}
          setNotice={setNotice}
        />
      ) : null}
    </section>
  );
}

function BillingPanel({
  tableOrder,
  menuItems,
  sentTotal,
  generateBill,
  generating,
  onSettled,
  setNotice
}: {
  tableOrder?: TableOrder | null;
  menuItems: MenuItem[];
  sentTotal: number;
  generateBill: () => void;
  generating: boolean;
  onSettled: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const queryClient = useQueryClient();
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discount, setDiscount] = useState("0");
  const [tip, setTip] = useState("0");
  const [reference, setReference] = useState("");
  const [payments, setPayments] = useState({ cash: "0", upi: "0", card: "0", online: "0" });
  const [managerPin, setManagerPin] = useState("");
  const [managerReason, setManagerReason] = useState("");
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionItems, setRevisionItems] = useState<Array<{ key: string; orderItemId?: string; menuItemId?: string; openName?: string; pricePaise: number; saleGroupId: string; productionUnitId?: string | null; name: string; quantity: number }>>([]);
  const [revisionAddMenuItemId, setRevisionAddMenuItemId] = useState("");
  const bill = tableOrder?.bill;
  const existingPaid = bill?.paid_paise ?? (tableOrder?.payments ?? []).reduce((total, payment) => total + payment.amount_paise, 0);
  const discountPaise = bill
    ? discountType === "percent"
      ? Math.round((bill.total_paise * Math.min(100, Number(discount || 0))) / 100)
      : Math.round(Number(discount || 0) * 100)
    : 0;
  const tipPaise = Math.round(Number(tip || 0) * 100);
  const finalTotal = bill ? Math.max(0, bill.total_paise - discountPaise + tipPaise) : 0;
  const newPaid = Object.values(payments).reduce((total, value) => total + Math.round(Number(value || 0) * 100), 0);
  const remaining = Math.max(0, finalTotal - existingPaid - newPaid);

  const settle = useMutation({
    mutationFn: () => {
      if (!bill) throw new Error("Generate the bill before taking payment.");
      const rows = (Object.entries(payments) as Array<[keyof typeof payments, string]>)
        .map(([method, value]) => ({ method, amountPaise: Math.round(Number(value || 0) * 100), reference: reference || undefined }))
        .filter((row) => row.amountPaise > 0);
      if (rows.length === 0) throw new Error("Enter at least one payment.");
      if (remaining > 0) throw new Error("Payment is less than the bill balance.");
      return hubApi.settleBill(bill.id, { discountType, discountValue: discountType === "percent" ? Number(discount || 0) : discountPaise, tipPaise, payments: rows });
    },
    onSuccess: async () => {
      await onSettled();
      await queryClient.invalidateQueries({ queryKey: ["dailyReports"] });
      setPayments({ cash: "0", upi: "0", card: "0", online: "0" });
      setReference("");
      setNotice({ tone: "good", text: "Bill punched. Table state refreshed from the hub." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const printBill = useMutation({
    mutationFn: () => {
      if (!bill) throw new Error("Generate the bill first.");
      return hubApi.printBill(bill.id);
    },
    onSuccess: () => setNotice({ tone: "good", text: "Bill print queued." }),
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const reprintBill = useMutation({
    mutationFn: () => {
      if (!bill) throw new Error("Generate the bill first.");
      return hubApi.reprintBill(bill.id, { managerApproval: { pin: managerPin, reason: managerReason || "Bill reprint", approvedBy: "manager" } });
    },
    onSuccess: () => {
      setManagerPin("");
      setManagerReason("");
      setNotice({ tone: "good", text: "Reprint queued after manager approval." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const markNc = useMutation({
    mutationFn: () => {
      if (!bill) throw new Error("Generate the bill first.");
      return hubApi.markBillNc(bill.id, { managerApproval: { pin: managerPin, reason: managerReason || "NC bill", approvedBy: "manager" } });
    },
    onSuccess: async () => {
      setManagerPin("");
      setManagerReason("");
      await onSettled();
      setNotice({ tone: "good", text: "NC bill printed and excluded from sales totals." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const reviseBill = useMutation({
    mutationFn: () => {
      if (!bill) throw new Error("Generate the bill first.");
      const items = revisionItems
        .filter((item) => item.quantity > 0)
        .map((item) =>
          item.menuItemId
            ? { orderItemId: item.orderItemId, menuItemId: item.menuItemId, quantity: item.quantity }
            : {
                orderItemId: item.orderItemId,
                openName: item.openName ?? item.name,
                openPricePaise: item.pricePaise,
                saleGroupId: item.saleGroupId,
                productionUnitId: item.productionUnitId ?? null,
                quantity: item.quantity
              }
        );
      if (items.length === 0) throw new Error("A revised bill needs at least one item.");
      return hubApi.reviseBill(bill.id, { items, managerApproval: { pin: managerPin, reason: managerReason || "Bill revised", approvedBy: "manager" } });
    },
    onSuccess: async () => {
      setRevisionOpen(false);
      setManagerPin("");
      setManagerReason("");
      await onSettled();
      setNotice({ tone: "good", text: "Bill revised and totals refreshed." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  function fillFull(method: keyof typeof payments) {
    setPayments({ cash: "0", upi: "0", card: "0", online: "0", [method]: String(Math.max(0, finalTotal - existingPaid) / 100) });
  }

  function openRevisionEditor() {
    const rows = (tableOrder?.items ?? [])
      .filter((item) => item.status !== "cancelled" && item.quantity > 0)
      .map((item) => ({
        key: item.id,
        orderItemId: item.id,
        menuItemId: item.menu_item_id ?? undefined,
        openName: item.menu_item_id ? undefined : item.name_snapshot,
        pricePaise: item.unit_price_paise,
        saleGroupId: item.sale_group_id,
        productionUnitId: item.production_unit_id,
        name: item.name_snapshot,
        quantity: item.quantity
      }));
    setRevisionItems(rows);
    setRevisionOpen(true);
  }

  function changeRevisionQty(key: string, delta: number) {
    setRevisionItems((current) => current.map((item) => item.key === key ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item));
  }

  function addRevisionDish() {
    const item = menuItems.find((menuItem) => menuItem.id === revisionAddMenuItemId);
    if (!item) return;
    setRevisionItems((current) => {
      const existing = current.find((row) => row.menuItemId === item.id);
      if (existing) return current.map((row) => row.key === existing.key ? { ...row, quantity: row.quantity + 1 } : row);
      return [
        ...current,
        {
          key: `new-${item.id}`,
          menuItemId: item.id,
          pricePaise: item.price_paise,
          saleGroupId: item.sale_group_id,
          productionUnitId: item.production_unit_id,
          name: item.name,
          quantity: 1
        }
      ];
    });
  }

  if (!tableOrder?.order) {
    return <Empty title="No active order" text="Add dishes and send them before generating a bill." />;
  }

  if (!bill) {
    return (
      <div className="bill-start">
        <div>
          <span>Current table total</span>
          <strong>{formatInr(sentTotal)}</strong>
        </div>
        <button type="button" disabled={sentTotal <= 0 || generating} onClick={generateBill}>
          {generating ? "Generating..." : "Generate bill"}
        </button>
      </div>
    );
  }

  return (
    <div className="billing-panel">
      <div className="bill-metrics">
        <Metric label="Bill total" value={formatInr(finalTotal)} />
        <Metric label="Already paid" value={formatInr(existingPaid)} />
        <Metric label="Balance" value={formatInr(Math.max(0, finalTotal - existingPaid))} />
      </div>
      {bill.revision_number ? <p className="plain-state">Bill revision {bill.revision_number}{bill.is_nc ? ` · NC: ${bill.nc_reason ?? ""}` : ""}</p> : null}
      <div className="action-strip">
        <button type="button" disabled={printBill.isPending} onClick={() => printBill.mutate()}>Print bill only</button>
      </div>
      <div className="adjust-grid">
        <label>
          Discount
          <span className="split-input">
            <select value={discountType} onChange={(event) => setDiscountType(event.target.value as "amount" | "percent")}>
              <option value="amount">Rs</option>
              <option value="percent">%</option>
            </select>
            <input value={discount} onChange={(event) => setDiscount(event.target.value)} inputMode="decimal" />
          </span>
        </label>
        <label>
          Tip
          <input value={tip} onChange={(event) => setTip(event.target.value)} inputMode="decimal" />
        </label>
      </div>
      <div className="quick-pay">
        <button type="button" onClick={() => fillFull("cash")}>Full cash</button>
        <button type="button" onClick={() => fillFull("upi")}>Full UPI</button>
        <button type="button" onClick={() => fillFull("card")}>Full card</button>
        <button type="button" onClick={() => fillFull("online")}>Full online</button>
      </div>
      <div className="payment-grid">
        {(["cash", "upi", "card", "online"] as const).map((method) => (
          <label key={method}>
            {method.toUpperCase()}
            <input value={payments[method]} onChange={(event) => setPayments((current) => ({ ...current, [method]: event.target.value }))} inputMode="decimal" />
          </label>
        ))}
      </div>
      <label>
        Payment note
        <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UPI ref, card slip, or cashier note" />
      </label>
      <button type="button" className="punch-button" disabled={settle.isPending || newPaid <= 0 || remaining > 0} onClick={() => settle.mutate()}>
        {settle.isPending ? "Punching..." : `Punch bill · ${remaining > 0 ? `${formatInr(remaining)} left` : "paid"}`}
      </button>
      <ManagerApprovalBox
        title="Manager-only bill actions"
        pin={managerPin}
        reason={managerReason}
        onPin={setManagerPin}
        onReason={setManagerReason}
        buttonLabel={reprintBill.isPending ? "Queueing..." : "Reprint bill"}
        disabled={reprintBill.isPending || managerPin.length < 4 || managerReason.trim().length < 3}
        onSubmit={() => reprintBill.mutate()}
      />
      {!revisionOpen ? (
        <button type="button" className="secondary-button" disabled={Boolean(bill.is_nc) || existingPaid > 0} onClick={openRevisionEditor}>
          Revise printed bill
        </button>
      ) : (
        <div className="revision-box">
          <div className="revision-head">
            <strong>Revise bill items</strong>
            <button type="button" onClick={() => setRevisionOpen(false)}>Cancel</button>
          </div>
          <div className="revision-add-row">
            <select value={revisionAddMenuItemId} onChange={(event) => setRevisionAddMenuItemId(event.target.value)}>
              <option value="">Add dish</option>
              {menuItems.filter((item) => item.active).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <button type="button" disabled={!revisionAddMenuItemId} onClick={addRevisionDish}>Add</button>
          </div>
          <LineItems
            emptyTitle="No bill items"
            emptyText="Add at least one item before saving the revised bill."
            rows={revisionItems.map((item) => ({
              id: item.key,
              title: item.name,
              meta: `${formatInr(item.pricePaise)} each`,
              quantity: item.quantity,
              amount: item.pricePaise * item.quantity,
              onMinus: () => changeRevisionQty(item.key, -1),
              onPlus: () => changeRevisionQty(item.key, 1)
            }))}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={reviseBill.isPending || managerPin.length < 4 || managerReason.trim().length < 3 || revisionItems.every((item) => item.quantity <= 0)}
            onClick={() => reviseBill.mutate()}
          >
            {reviseBill.isPending ? "Saving revision..." : "Save revised bill"}
          </button>
        </div>
      )}
      <button
        type="button"
        className="danger-link"
        disabled={markNc.isPending || managerPin.length < 4 || managerReason.trim().length < 3}
        onClick={() => markNc.mutate()}
      >
        {markNc.isPending ? "Marking NC..." : "Mark NC bill"}
      </button>
    </div>
  );
}

function KitchenView({ bootstrap, setNotice }: { bootstrap: Bootstrap; setNotice: NoticeSetter }) {
  const queryClient = useQueryClient();
  const selectedKdsUnitId = useHubStore((state) => state.selectedKdsUnitId);
  const setSelectedKdsUnitId = useHubStore((state) => state.setSelectedKdsUnitId);
  const activeUnits = bootstrap.productionUnits.filter((unit) => unit.active);
  const unitId = selectedKdsUnitId ?? activeUnits[0]?.id ?? "";

  useEffect(() => {
    if (!selectedKdsUnitId && activeUnits[0]) setSelectedKdsUnitId(activeUnits[0].id);
  }, [selectedKdsUnitId, activeUnits, setSelectedKdsUnitId]);

  const tickets = useQuery({ queryKey: ["kds", unitId], queryFn: () => hubApi.kds(unitId), enabled: Boolean(unitId) });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => hubApi.updateKotStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["kds", unitId] });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  return (
    <div className="kitchen-layout">
      <section className="panel">
        <div className="panel-title">
          <h2>Kitchen screen</h2>
          <select value={unitId} onChange={(event) => setSelectedKdsUnitId(event.target.value)}>
            {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </div>
        {!unitId ? <Empty title="No kitchen added" text="Add a kitchen or counter in Setup." /> : null}
        <div className="kot-grid">
          {(tickets.data ?? []).map((ticket) => (
            <article key={ticket.id} className="kot-card">
              <header>
                <strong>#{ticket.sequence} · {ticket.table_name}</strong>
                <span>{ticket.status}</span>
              </header>
              <ul>
                {ticket.items.map((item, index) => <li key={`${item.name_snapshot}-${index}`}>{item.quantity_delta} x {item.name_snapshot}</li>)}
              </ul>
              <footer>
                {["preparing", "ready", "served"].map((status) => (
                  <button key={status} type="button" disabled={ticket.status === status || statusMutation.isPending} onClick={() => statusMutation.mutate({ id: ticket.id, status })}>
                    {status}
                  </button>
                ))}
              </footer>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportsView({ setNotice }: { setNotice: NoticeSetter }) {
  const queryClient = useQueryClient();
  const closeSummary = useQuery({ queryKey: ["closeSummary"], queryFn: hubApi.closeSummary });
  const dailyReports = useQuery({ queryKey: ["dailyReports"], queryFn: hubApi.dailyReports });
  const [closingCash, setClosingCash] = useState("");
  const closeDay = useMutation({
    mutationFn: () => hubApi.closeDay(Math.round(Number(closingCash || 0) * 100)),
    onSuccess: async () => {
      setClosingCash("");
      await queryClient.invalidateQueries();
      setNotice({ tone: "good", text: "Day closed. Report saved locally and queued for cloud sync." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const summary = closeSummary.data;

  return (
    <div className="reports-layout">
      <section className="panel">
        <div className="panel-title">
          <h2>Today before close</h2>
          <span>{summary?.openDay ? "Open day" : "No day open"}</span>
        </div>
        {summary?.openDay ? (
          <>
            <div className="report-metrics">
              <Metric label="Sales" value={formatInr(summary.finalSalesPaise)} />
              <Metric label="Cash" value={formatInr(summary.cashPaymentsPaise)} />
              <Metric label="UPI/Card/Online" value={formatInr(summary.nonCashPaymentsPaise)} />
              <Metric label="Expected cash" value={formatInr(summary.expectedClosingCashPaise)} />
            </div>
            <form className="close-day-form" onSubmit={(event) => { event.preventDefault(); closeDay.mutate(); }}>
              <label>
                Actual closing cash
                <input value={closingCash} onChange={(event) => setClosingCash(event.target.value)} inputMode="decimal" />
              </label>
              <button type="submit" disabled={closeDay.isPending || summary.openOrders > 0 || summary.billedOrders > 0}>
                Close day and save report
              </button>
            </form>
            {summary.openOrders > 0 || summary.billedOrders > 0 ? <p className="warning-text">Settle or cancel open tables before closing the day.</p> : null}
          </>
        ) : (
          <Empty title="No open day" text="Open today from Setup before taking orders." />
        )}
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Closed day reports</h2>
          <span>{dailyReports.data?.length ?? 0} saved</span>
        </div>
        <div className="report-list">
          {(dailyReports.data ?? []).map((report) => (
            <article key={report.pos_day_id} className="report-row">
              <div>
                <strong>{report.business_date}</strong>
                <span>{report.bill_count} bills · {formatInr(report.final_sales_paise)} sales</span>
              </div>
              <div>
                <b>{formatInr(report.total_payments_paise)}</b>
                <span>cash variance {formatInr(report.cash_variance_paise)}</span>
              </div>
            </article>
          ))}
          {!dailyReports.data?.length ? <Empty title="No closed reports yet" text="Close a POS day and this hub will save the full daily record." /> : null}
        </div>
      </section>
    </div>
  );
}

function AdvancedView({ bootstrap, setNotice }: { bootstrap: Bootstrap; setNotice: NoticeSetter }) {
  const queryClient = useQueryClient();
  const [newPin, setNewPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [template, setTemplate] = useState({
    restaurantName: bootstrap.ticketTemplate?.restaurantName ?? "",
    taxRegistrationText: bootstrap.ticketTemplate?.taxRegistrationText ?? "",
    billHeader: bootstrap.ticketTemplate?.billHeader ?? "",
    billFooter: bootstrap.ticketTemplate?.billFooter ?? "",
    kotHeader: bootstrap.ticketTemplate?.kotHeader ?? "",
    kotFooter: bootstrap.ticketTemplate?.kotFooter ?? ""
  });
  const pullCloud = useMutation({
    mutationFn: hubApi.pullCloud,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      setNotice({ tone: "good", text: `Cloud updates applied: ${result.applied}` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const prints = useMutation({
    mutationFn: hubApi.processPrints,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNotice({ tone: "good", text: `Print queue checked. Printed ${result.printed}, failed ${result.failed}.` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const savePin = useMutation({
    mutationFn: () => hubApi.setManagerPin({ currentPin: currentPin || undefined, newPin, updatedBy: "admin" }),
    onSuccess: () => {
      setCurrentPin("");
      setNewPin("");
      setNotice({ tone: "good", text: "Manager PIN saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const saveTemplate = useMutation({
    mutationFn: () => hubApi.updateTicketTemplate(template),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNotice({ tone: "good", text: "Bill and KOT text saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  return (
    <div className="advanced-layout">
      <section className="panel">
        <div className="panel-title">
          <h2>Manager approval</h2>
        </div>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); savePin.mutate(); }}>
          <label>
            Current PIN
            <input value={currentPin} onChange={(event) => setCurrentPin(event.target.value)} type="password" placeholder="Only needed when changing PIN" />
          </label>
          <label>
            New manager PIN
            <input value={newPin} onChange={(event) => setNewPin(event.target.value)} type="password" />
          </label>
          <button type="submit" disabled={newPin.length < 4 || savePin.isPending}>Save PIN</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Tax groups</h2>
        </div>
        <div className="record-list">
          {bootstrap.saleGroups.map((group) => (
            <SaleGroupRow key={group.id} group={group} units={bootstrap.productionUnits} setNotice={setNotice} onSaved={() => queryClient.invalidateQueries({ queryKey: ["bootstrap"] })} />
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Bill and KOT text</h2>
        </div>
        <form className="template-form" onSubmit={(event) => { event.preventDefault(); saveTemplate.mutate(); }}>
          {(["restaurantName", "taxRegistrationText", "billHeader", "billFooter", "kotHeader", "kotFooter"] as const).map((field) => (
            <label key={field}>
              {fieldLabel(field)}
              <input value={template[field]} onChange={(event) => setTemplate((current) => ({ ...current, [field]: event.target.value }))} />
            </label>
          ))}
          <button type="submit" disabled={saveTemplate.isPending}>Save print text</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Support tools</h2>
        </div>
        <div className="action-strip">
          <button type="button" onClick={() => pullCloud.mutate()} disabled={pullCloud.isPending}>
            <CloudDownload size={18} /> Get cloud updates
          </button>
          <button type="button" onClick={() => prints.mutate()} disabled={prints.isPending}>
            <Printer size={18} /> Run print queue
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Recent print jobs</h2>
        </div>
        <div className="record-list">
          {bootstrap.printJobs.map((job) => (
            <article key={job.id} className="record-row">
              <div>
                <strong>{job.target_type}</strong>
                <span>{job.status} · attempts {job.attempts}{job.last_error ? ` · ${job.last_error}` : ""}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SetupCard({ title, done, icon, children }: { title: string; done: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <section className={done ? "setup-card done" : "setup-card"}>
      <header>
        <div className="setup-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          <span>{done ? "Ready" : "Needs setup"}</span>
        </div>
      </header>
      {children}
    </section>
  );
}

function EditableRecordList({
  setNotice,
  rows
}: {
  setNotice: NoticeSetter;
  rows: Array<{
    id: string;
    title: string;
    meta: string;
    active: boolean;
    onToggle: () => Promise<unknown>;
    onDelete: () => Promise<unknown>;
    editForm: (close: () => void) => ReactNode;
  }>;
}) {
  const [busyId, setBusyId] = useState("");
  const [editingId, setEditingId] = useState("");
  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
      setNotice({ tone: "good", text: "Saved." });
    } catch (error) {
      setNotice({ tone: "bad", text: messageOf(error) });
    } finally {
      setBusyId("");
    }
  }
  return (
    <div className="record-list">
      {rows.map((row) => (
        <article key={row.id} className="record-row">
          <div>
            <strong>{row.title}</strong>
            <span>{row.meta}</span>
          </div>
          <div className="row-actions">
            <button type="button" disabled={busyId === row.id} onClick={() => setEditingId((current) => current === row.id ? "" : row.id)}>
              {editingId === row.id ? <X size={15} /> : <Pencil size={15} />}
              {editingId === row.id ? "Close" : "Edit"}
            </button>
            <button type="button" disabled={busyId === row.id} onClick={() => void run(row.id, row.onToggle)}>
              {row.active ? "Disable" : "Enable"}
            </button>
            <button type="button" className="icon-button danger" disabled={busyId === row.id} onClick={() => void run(row.id, row.onDelete)} aria-label={`Delete ${row.title}`}>
              <Trash2 size={16} />
            </button>
          </div>
          {editingId === row.id ? row.editForm(() => setEditingId("")) : null}
        </article>
      ))}
      {!rows.length ? <Empty title="Nothing added yet" text="Saved records appear here immediately." /> : null}
    </div>
  );
}

function FloorEditForm({ floor, onSaved, setNotice }: { floor: Floor; onSaved: () => Promise<void>; setNotice: NoticeSetter }) {
  const [name, setName] = useState(floor.name);
  const [saving, setSaving] = useState(false);
  return (
    <form className="row-edit-form" onSubmit={(event) => {
      event.preventDefault();
      setSaving(true);
      hubApi.updateFloor(floor.id, { name })
        .then(onSaved)
        .then(() => setNotice({ tone: "good", text: "Floor updated." }))
        .catch((error) => setNotice({ tone: "bad", text: messageOf(error) }))
        .finally(() => setSaving(false));
    }}>
      <label>
        Floor name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="submit" disabled={!name.trim() || saving}>Save</button>
    </form>
  );
}

function TableEditForm({
  table,
  floors,
  onSaved,
  setNotice
}: {
  table: Table;
  floors: Floor[];
  onSaved: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [name, setName] = useState(table.name);
  const [floorId, setFloorId] = useState(table.floor_id);
  const [saving, setSaving] = useState(false);
  return (
    <form className="row-edit-form" onSubmit={(event) => {
      event.preventDefault();
      setSaving(true);
      hubApi.updateTable(table.id, { name, floorId })
        .then(onSaved)
        .then(() => setNotice({ tone: "good", text: "Table updated." }))
        .catch((error) => setNotice({ tone: "bad", text: messageOf(error) }))
        .finally(() => setSaving(false));
    }}>
      <label>
        Table name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Floor
        <select value={floorId} onChange={(event) => setFloorId(event.target.value)}>
          {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!name.trim() || !floorId || saving}>Save</button>
    </form>
  );
}

function UnitEditForm({ unit, onSaved, setNotice }: { unit: ProductionUnit; onSaved: () => Promise<void>; setNotice: NoticeSetter }) {
  const [name, setName] = useState(unit.name);
  const [saving, setSaving] = useState(false);
  return (
    <form className="row-edit-form" onSubmit={(event) => {
      event.preventDefault();
      setSaving(true);
      hubApi.updateUnit(unit.id, { name })
        .then(onSaved)
        .then(() => setNotice({ tone: "good", text: "Kitchen updated." }))
        .catch((error) => setNotice({ tone: "bad", text: messageOf(error) }))
        .finally(() => setSaving(false));
    }}>
      <label>
        Kitchen or counter name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="submit" disabled={!name.trim() || saving}>Save</button>
    </form>
  );
}

function DishEditForm({
  item,
  units,
  saleGroups,
  onSaved,
  setNotice
}: {
  item: MenuItem;
  units: ProductionUnit[];
  saleGroups: Bootstrap["saleGroups"];
  onSaved: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price_paise / 100));
  const [productionUnitId, setProductionUnitId] = useState(item.production_unit_id ?? "");
  const [saleGroupId, setSaleGroupId] = useState(item.sale_group_id ?? "sg-food");
  const [saving, setSaving] = useState(false);
  const pricePaise = Math.round(Number(price || 0) * 100);
  return (
    <form className="row-edit-form dish-edit-form" onSubmit={(event) => {
      event.preventDefault();
      setSaving(true);
      hubApi.updateDish(item.id, { name, pricePaise, productionUnitId: productionUnitId || null, saleGroupId })
        .then(onSaved)
        .then(() => setNotice({ tone: "good", text: "Dish updated." }))
        .catch((error) => setNotice({ tone: "bad", text: messageOf(error) }))
        .finally(() => setSaving(false));
    }}>
      <label>
        Dish name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Price
        <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" />
      </label>
      <label>
        Kitchen
        <select value={productionUnitId} onChange={(event) => setProductionUnitId(event.target.value)}>
          <option value="">No kitchen assigned</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
      </label>
      <label>
        Group
        <select value={saleGroupId} onChange={(event) => setSaleGroupId(event.target.value)}>
          {saleGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!name.trim() || pricePaise <= 0 || saving}>Save</button>
    </form>
  );
}

function SaleGroupRow({
  group,
  units,
  setNotice,
  onSaved
}: {
  group: Bootstrap["saleGroups"][number];
  units: ProductionUnit[];
  setNotice: NoticeSetter;
  onSaved: () => Promise<unknown>;
}) {
  const [defaultProductionUnitId, setDefaultProductionUnitId] = useState(group.default_production_unit_id ?? "");
  const [ticketLabel, setTicketLabel] = useState<"KOT" | "BOT">(group.ticket_label);
  const [taxText, setTaxText] = useState(() => {
    try {
      return (JSON.parse(group.tax_components_json) as Array<{ name: string; rateBps: number }>)
        .map((component) => `${component.name}:${component.rateBps / 100}`)
        .join(", ");
    } catch {
      return "";
    }
  });
  const [saving, setSaving] = useState(false);
  function parseTaxComponents() {
    return taxText
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, percent] = part.split(":").map((value) => value.trim());
        return { name: name ?? "", rateBps: Math.round(Number(percent || 0) * 100) };
      })
      .filter((component) => component.name && Number.isFinite(component.rateBps));
  }
  return (
    <article className="record-row">
      <div>
        <strong>{group.name}</strong>
        <span>{group.kind} · {ticketLabel} · {group.default_production_unit_name ?? "No default counter"}</span>
      </div>
      <form className="row-edit-form" onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        hubApi.updateSaleGroup(group.id, {
          defaultProductionUnitId: defaultProductionUnitId || null,
          ticketLabel,
          taxComponents: parseTaxComponents()
        })
          .then(onSaved)
          .then(() => setNotice({ tone: "good", text: "Tax group saved." }))
          .catch((error) => setNotice({ tone: "bad", text: messageOf(error) }))
          .finally(() => setSaving(false));
      }}>
        <label>
          Default counter
          <select value={defaultProductionUnitId} onChange={(event) => setDefaultProductionUnitId(event.target.value)}>
            <option value="">None</option>
            {units.filter((unit) => unit.active).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </label>
        <label>
          Ticket
          <select value={ticketLabel} onChange={(event) => setTicketLabel(event.target.value as "KOT" | "BOT")}>
            <option value="KOT">KOT</option>
            <option value="BOT">BOT</option>
          </select>
        </label>
        <label>
          Taxes
          <input value={taxText} onChange={(event) => setTaxText(event.target.value)} placeholder="CGST:2.5, SGST:2.5" />
        </label>
        <button type="submit" disabled={saving}>Save</button>
      </form>
    </article>
  );
}

function LineItems({
  rows,
  emptyTitle,
  emptyText
}: {
  rows: Array<{ id: string; title: string; meta: string; quantity: number; amount: number; onMinus?: () => void; onPlus?: () => void }>;
  emptyTitle: string;
  emptyText: string;
}) {
  if (!rows.length) return <Empty title={emptyTitle} text={emptyText} />;
  return (
    <div className="line-list">
      {rows.map((row) => (
        <article key={row.id} className="line-row">
          <div>
            <strong>{row.title}</strong>
            <span>{row.meta}</span>
          </div>
          <div className="qty-cluster">
            {row.onMinus ? <button type="button" onClick={row.onMinus}>-</button> : null}
            <b>{row.quantity}</b>
            {row.onPlus ? <button type="button" onClick={row.onPlus}>+</button> : null}
          </div>
          <strong>{formatInr(row.amount)}</strong>
        </article>
      ))}
    </div>
  );
}

function ManagerApprovalBox({
  title,
  pin,
  reason,
  onPin,
  onReason,
  buttonLabel,
  disabled,
  danger,
  onSubmit
}: {
  title: string;
  pin: string;
  reason: string;
  onPin: (value: string) => void;
  onReason: (value: string) => void;
  buttonLabel: string;
  disabled: boolean;
  danger?: boolean;
  onSubmit: () => void;
}) {
  return (
    <section className="manager-approval">
      <strong>{title}</strong>
      <div className="approval-grid">
        <label>
          Manager PIN
          <input value={pin} onChange={(event) => onPin(event.target.value)} type="password" placeholder="4+ digit PIN" />
        </label>
        <label>
          Reason
          <input value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Reason required" />
        </label>
        <button type="button" className={danger ? "danger-link" : undefined} disabled={disabled} onClick={onSubmit}>
          {buttonLabel}
        </button>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

type NoticeSetter = (notice: { tone: "good" | "bad"; text: string }) => void;

function titleForView(view: HubView) {
  const titles: Record<HubView, string> = {
    setup: "Setup",
    orders: "Take Orders",
    kitchen: "Kitchen",
    reports: "Reports",
    advanced: "Advanced"
  };
  return titles[view];
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    restaurantName: "Restaurant name",
    taxRegistrationText: "GST / VAT line",
    billHeader: "Bill header",
    billFooter: "Bill footer",
    kotHeader: "KOT/BOT header",
    kotFooter: "KOT/BOT footer"
  };
  return labels[field] ?? field;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
