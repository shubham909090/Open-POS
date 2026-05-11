import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInr } from "@gaurav-pos/shared";
import {
  BadgeIndianRupee,
  CalendarCheck,
  ChefHat,
  ClipboardList,
  CloudDownload,
  LayoutDashboard,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Users
} from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { hubApi, setAuthToken, getAuthToken, type Bootstrap, type MenuItem, type TableOrder } from "./hub-api.js";
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
  const firstFloorId = bootstrap.floors.find((floor) => floor.active)?.id ?? bootstrap.floors[0]?.id ?? "";

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
    mutationFn: () => hubApi.createTable(firstFloorId, tableName),
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
        pricePaise: Math.round(Number(dishPrice || 0) * 100),
        productionUnitId: dishUnit || null,
        active: true
      }),
    onSuccess: async () => {
      setDishName("");
      setDishPrice("");
      setDishUnit("");
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

      <SetupCard title="Rooms And Tables" done={bootstrap.tables.some((table) => table.active)} icon={<Users size={20} />}>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); createFloor.mutate(); }}>
          <label>
            Room name
            <input value={floorName} onChange={(event) => setFloorName(event.target.value)} placeholder="Main hall" />
          </label>
          <button disabled={!floorName.trim() || createFloor.isPending} type="submit">Add room</button>
        </form>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); createTable.mutate(); }}>
          <label>
            Table name
            <input value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="T1" />
          </label>
          <button disabled={!firstFloorId || !tableName.trim() || createTable.isPending} type="submit">Add table</button>
        </form>
        <RecordList
          rows={bootstrap.tables.map((table) => ({
            id: table.id,
            title: table.name,
            meta: `${table.floor_name} · ${table.active ? table.status : "disabled"}`,
            active: table.active,
            onToggle: () => hubApi.updateTable(table.id, { active: !table.active }).then(invalidate),
            onDelete: () => hubApi.deleteTable(table.id).then(invalidate)
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
        <RecordList
          rows={bootstrap.productionUnits.map((unit) => ({
            id: unit.id,
            title: unit.name,
            meta: unit.active ? "Active" : "Disabled",
            active: unit.active,
            onToggle: () => hubApi.updateUnit(unit.id, { active: !unit.active }).then(invalidate),
            onDelete: () => hubApi.deleteUnit(unit.id).then(invalidate)
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
          <button disabled={!dishName.trim() || Number(dishPrice) < 0 || createDish.isPending} type="submit">Add dish</button>
        </form>
        <RecordList
          rows={bootstrap.menuItems.map((item) => ({
            id: item.id,
            title: item.name,
            meta: `${formatInr(item.price_paise)} · ${item.production_unit_name ?? "No kitchen assigned"} · ${item.active ? "active" : "disabled"}`,
            active: item.active,
            onToggle: () => hubApi.updateDish(item.id, { active: !item.active }).then(invalidate),
            onDelete: () => hubApi.deleteDish(item.id).then(invalidate)
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
        <div className="table-list">
          {bootstrap.tables.filter((table) => table.active).map((table) => (
            <button
              key={table.id}
              type="button"
              className={table.id === selectedTable?.id ? "table-tile active" : `table-tile ${table.status}`}
              onClick={() => selectTable(table.id)}
            >
              <strong>{table.name}</strong>
              <span>{table.status === "occupied" ? "Occupied" : "Free"}</span>
            </button>
          ))}
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

      <TableWorkspace tableId={selectedTable?.id ?? null} tableName={selectedTable?.name ?? ""} setNotice={setNotice} />
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

function TableWorkspace({ tableId, tableName, setNotice }: { tableId: string | null; tableName: string; setNotice: NoticeSetter }) {
  const queryClient = useQueryClient();
  const orderPanel = useHubStore((state) => state.orderPanel);
  const setOrderPanel = useHubStore((state) => state.setOrderPanel);
  const drafts = useHubStore((state) => state.drafts);
  const changeDraftQty = useHubStore((state) => state.changeDraftQty);
  const clearDraft = useHubStore((state) => state.clearDraft);
  const [guests, setGuests] = useState("2");
  const draft = tableId ? Object.values(drafts[tableId] ?? {}) : [];
  const tableOrder = useQuery({
    queryKey: ["tableOrder", tableId],
    queryFn: () => hubApi.tableOrder(tableId as string),
    enabled: Boolean(tableId)
  });
  const data = tableOrder.data;
  const sentItems = (data?.items ?? []).filter((item) => item.status !== "cancelled" && item.quantity > 0);
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
        captainId: "cashier",
        pax: Number(guests || 1),
        items: draft.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity }))
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
      return hubApi.cancelOrder(orderId);
    },
    onSuccess: async () => {
      if (tableId) clearDraft(tableId);
      await refreshTable();
      setOrderPanel("new");
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
            <button type="button" className="danger-link" disabled={cancelOrder.isPending} onClick={() => cancelOrder.mutate()}>
              Cancel order
            </button>
          ) : null}
        </div>
      ) : null}

      {orderPanel === "bill" ? (
        <BillingPanel
          tableOrder={data}
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
  sentTotal,
  generateBill,
  generating,
  onSettled,
  setNotice
}: {
  tableOrder?: TableOrder | null;
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

  function fillFull(method: keyof typeof payments) {
    setPayments({ cash: "0", upi: "0", card: "0", online: "0", [method]: String(Math.max(0, finalTotal - existingPaid) / 100) });
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

  return (
    <div className="advanced-layout">
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

function RecordList({
  rows
}: {
  rows: Array<{ id: string; title: string; meta: string; active: boolean; onToggle: () => Promise<unknown>; onDelete: () => Promise<unknown> }>;
}) {
  const [busyId, setBusyId] = useState("");
  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
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
            <button type="button" disabled={busyId === row.id} onClick={() => void run(row.id, row.onToggle)}>
              {row.active ? "Disable" : "Enable"}
            </button>
            <button type="button" className="icon-button danger" disabled={busyId === row.id} onClick={() => void run(row.id, row.onDelete)} aria-label={`Delete ${row.title}`}>
              <Trash2 size={16} />
            </button>
          </div>
        </article>
      ))}
      {!rows.length ? <Empty title="Nothing added yet" text="Saved records appear here immediately." /> : null}
    </div>
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

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
