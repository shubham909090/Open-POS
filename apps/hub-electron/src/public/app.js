const state = {
  bootstrap: null,
  selectedTableId: null,
  selectedOrder: null,
  draft: new Map()
};

const $ = (id) => document.getElementById(id);
const money = (paise) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((paise ?? 0) / 100);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return response.json();
}

async function loadBootstrap() {
  state.bootstrap = await api("/sync/bootstrap");
  $("hubHealth").textContent = "LAN hub online";
  const pending = state.bootstrap.syncStatus?.counts?.pending ?? 0;
  $("syncStatus").textContent = `Sync pending: ${pending}`;
  renderDay();
  renderTables();
  renderMenu();
  renderUnits();
  renderPrintJobs();
  await loadKds();
}

function renderDay() {
  const day = state.bootstrap?.openDay;
  $("dayStatus").textContent = day ? `POS day open: ${day.id}` : "POS day closed";
  $("openDayForm").style.display = day ? "none" : "flex";
}

function renderTables() {
  const tables = $("tables");
  tables.textContent = "";
  for (const table of state.bootstrap?.tables ?? []) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `table-tile ${table.status} ${table.id === state.selectedTableId ? "selected" : ""}`;
    tile.innerHTML = `<strong>${table.name}</strong><span>${table.floor_name} · ${table.status}</span>`;
    tile.addEventListener("click", () => selectTable(table.id));
    tables.append(tile);
  }
}

function renderMenu() {
  const menu = $("menu");
  menu.textContent = "";
  for (const item of state.bootstrap?.menuItems ?? []) {
    if (!item.active) continue;
    const row = document.createElement("div");
    row.className = "menu-item";
    row.innerHTML = `
      <div>
        <strong>${item.name}</strong><br />
        <small>${item.production_unit_name} · ${money(item.price_paise)}</small>
      </div>
    `;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "+";
    button.className = "qty-btn";
    button.addEventListener("click", () => addDraftItem(item));
    row.append(button);
    menu.append(row);
  }
}

function renderUnits() {
  const select = $("kdsUnit");
  const current = select.value;
  select.textContent = "";
  for (const unit of state.bootstrap?.productionUnits ?? []) {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = unit.name;
    select.append(option);
  }
  if (current) select.value = current;
}

function renderPrintJobs() {
  const list = $("printJobs");
  list.textContent = "";
  const jobs = state.bootstrap?.printJobs ?? [];
  if (jobs.length === 0) return list.append(emptyNode());
  for (const job of jobs) {
    const row = document.createElement("div");
    row.className = "print-job";
    row.innerHTML = `
      <div>
        <strong>${job.target_type} ${job.target_id}</strong><br />
        <small>${job.status} · attempts ${job.attempts}${job.last_error ? ` · ${job.last_error}` : ""}</small>
      </div>
      <span class="badge">${job.printer_host ?? "cashier"}</span>
    `;
    if (job.status === "failed") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Retry";
      retry.addEventListener("click", async () => {
        await api(`/print-jobs/${job.id}/retry`, {
          method: "POST",
          body: JSON.stringify({ requestedBy: "cashier-1" })
        });
        await loadBootstrap();
      });
      row.append(retry);
    }
    list.append(row);
  }
}

async function selectTable(tableId) {
  state.selectedTableId = tableId;
  state.selectedOrder = await api(`/tables/${tableId}/order`);
  hydrateDraftFromOrder();
  renderTables();
  renderOrder();
}

function hydrateDraftFromOrder() {
  state.draft = new Map();
  const items = state.selectedOrder?.items ?? [];
  for (const item of items) {
    if (item.status === "cancelled") continue;
    state.draft.set(`${item.menu_item_id}::${item.notes ?? ""}`, {
      menuItemId: item.menu_item_id,
      name: item.name_snapshot,
      quantity: item.quantity,
      notes: item.notes ?? "",
      pricePaise: item.unit_price_paise
    });
  }
}

function addDraftItem(menuItem) {
  if (!state.selectedTableId) return;
  const key = `${menuItem.id}::`;
  const current = state.draft.get(key);
  state.draft.set(key, {
    menuItemId: menuItem.id,
    name: menuItem.name,
    quantity: (current?.quantity ?? 0) + 1,
    notes: "",
    pricePaise: menuItem.price_paise
  });
  renderOrder();
}

function changeDraftQty(key, delta) {
  const current = state.draft.get(key);
  if (!current) return;
  const quantity = Math.max(0, current.quantity + delta);
  if (quantity === 0) state.draft.delete(key);
  else state.draft.set(key, { ...current, quantity });
  renderOrder();
}

function renderOrder() {
  const table = state.bootstrap?.tables?.find((item) => item.id === state.selectedTableId);
  $("orderTitle").textContent = table ? `Table ${table.name}` : "Select a table";
  $("orderMeta").textContent = state.selectedOrder?.order
    ? `${state.selectedOrder.order.status} · ${state.selectedOrder.items.length} items`
    : table
      ? `${table.status} · no active order`
      : "";

  const list = $("draftItems");
  list.textContent = "";
  const entries = [...state.draft.entries()];
  if (entries.length === 0) return list.append(emptyNode());

  for (const [key, item] of entries) {
    const row = document.createElement("div");
    row.className = "draft-item";
    row.innerHTML = `<div><strong>${item.name}</strong><br /><small>${money(item.pricePaise)} each</small></div><span>${item.quantity}</span>`;
    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "qty-btn secondary";
    minus.textContent = "-";
    minus.addEventListener("click", () => changeDraftQty(key, -1));
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "qty-btn";
    plus.textContent = "+";
    plus.addEventListener("click", () => changeDraftQty(key, 1));
    row.append(minus, plus);
    list.append(row);
  }
}

async function loadKds() {
  const unitId = $("kdsUnit").value || state.bootstrap?.productionUnits?.[0]?.id;
  if (!unitId) return;
  $("kdsUnit").value = unitId;
  const rows = await api(`/kds/${unitId}`);
  const list = $("kds");
  list.textContent = "";
  if (rows.length === 0) return list.append(emptyNode());
  for (const kot of rows) {
    const node = document.createElement("div");
    node.className = "kot";
    node.innerHTML = `
      <div class="kot-title">
        <div><strong>#${kot.sequence} ${kot.table_name}</strong><br /><small>${kot.type} · ${kot.status}</small></div>
        <span class="badge">${kot.captain_id}</span>
      </div>
      <ul class="kot-items">
        ${(kot.items ?? []).map((item) => `<li>${item.quantity_delta} x ${item.name_snapshot}</li>`).join("")}
      </ul>
    `;
    const actions = document.createElement("div");
    actions.className = "kot-actions";
    for (const status of ["preparing", "ready", "served"]) {
      const action = document.createElement("button");
      action.type = "button";
      action.textContent = status;
      action.disabled = kot.status === status;
      action.addEventListener("click", async () => {
        await api(`/kot/${kot.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
        await loadKds();
      });
      actions.append(action);
    }
    node.append(actions);
    list.append(node);
  }
}

function emptyNode() {
  return $("emptyState").content.firstElementChild.cloneNode(true);
}

$("openDayForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const today = new Date().toISOString().slice(0, 10);
  await api("/pos-days/open", {
    method: "POST",
    body: JSON.stringify({
      outletId: "outlet-main",
      businessDate: today,
      openingCashPaise: Number($("openingCash").value || 0) * 100,
      openedBy: "cashier-1"
    })
  });
  await loadBootstrap();
});

$("submitOrder").addEventListener("click", async () => {
  if (!state.selectedTableId) return;
  await api("/orders/submit", {
    method: "POST",
    body: JSON.stringify({
      tableId: state.selectedTableId,
      captainId: $("captainId").value || "waiter-1",
      pax: Number($("pax").value || 1),
      orderType: "dine_in",
      items: [...state.draft.values()].map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes
      }))
    })
  });
  await loadBootstrap();
  await selectTable(state.selectedTableId);
});

$("generateBill").addEventListener("click", async () => {
  const orderId = state.selectedOrder?.order?.id;
  if (!orderId) return;
  await api(`/bills/${orderId}/generate`, { method: "POST" });
  await selectTable(state.selectedTableId);
  await loadBootstrap();
});

$("settleBill").addEventListener("click", async () => {
  const bill = state.selectedOrder?.bill;
  if (!bill) return;
  await api(`/bills/${bill.id}/settle`, {
    method: "POST",
    body: JSON.stringify({ method: "cash", amountPaise: bill.total_paise, receivedBy: "cashier-1" })
  });
  state.selectedOrder = null;
  state.draft.clear();
  await loadBootstrap();
  renderOrder();
});

$("cancelOrder").addEventListener("click", async () => {
  const orderId = state.selectedOrder?.order?.id;
  if (!orderId) return;
  await api(`/orders/${orderId}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Cancelled from cashier" }) });
  state.selectedOrder = null;
  state.draft.clear();
  await loadBootstrap();
  renderOrder();
});

$("refresh").addEventListener("click", loadBootstrap);
$("kdsUnit").addEventListener("change", loadKds);
$("processPrints").addEventListener("click", async () => {
  await api("/print-jobs/process", { method: "POST" });
  await loadBootstrap();
});

const protocol = location.protocol === "https:" ? "wss:" : "ws:";
const realtime = new WebSocket(`${protocol}//${location.host}/realtime`);
realtime.addEventListener("message", () => {
  void loadBootstrap();
});

loadBootstrap().catch((error) => {
  $("hubHealth").textContent = error.message;
});
