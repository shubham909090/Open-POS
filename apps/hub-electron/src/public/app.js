const state = {
  bootstrap: null,
  selectedTableId: null,
  selectedOrder: null,
  draft: new Map(),
  systemPrinters: [],
  devices: [],
  backups: [],
  closeSummary: null
};

const $ = (id) => document.getElementById(id);
const money = (paise) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((paise ?? 0) / 100);

async function api(path, options = {}) {
  const token = $("deviceToken")?.value || localStorage.getItem("deviceToken") || "dev-admin-token";
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-device-token": token,
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
  if ($("deviceToken") && !$("deviceToken").value) {
    $("deviceToken").value = localStorage.getItem("deviceToken") || "dev-admin-token";
  }
  state.bootstrap = await api("/sync/bootstrap");
  $("hubHealth").textContent = "LAN hub online";
  const pending = state.bootstrap.syncStatus?.counts?.pending ?? 0;
  $("syncStatus").textContent = `Sync pending: ${pending}`;
  renderDay();
  renderTables();
  renderMenu();
  renderUnits();
  renderSetupOptions();
  renderPrintJobs();
  await renderReceiptPrinter();
  await loadAdminPanels();
  await loadKds();
}

async function loadAdminPanels() {
  const [devices, backups, closeSummary] = await Promise.all([
    api("/devices").catch(() => []),
    api("/backups").catch(() => []),
    api("/pos-days/close-summary").catch(() => null)
  ]);
  state.devices = devices;
  state.backups = backups;
  state.closeSummary = closeSummary;
  renderDevices();
  renderBackups();
  renderMenuAdmin();
  renderCloseSummary();
}

async function loadSystemPrinters() {
  try {
    state.systemPrinters = await api("/system-printers");
  } catch {
    state.systemPrinters = [];
  }
  renderPrinterOptions();
}

function renderCloseSummary() {
  const target = $("closeSummary");
  if (!target) return;
  const summary = state.closeSummary;
  if (!summary?.openDay) {
    target.textContent = "No open day.";
    return;
  }
  target.innerHTML = `
    <span>Open orders: <strong>${summary.openOrders}</strong></span>
    <span>Unpaid bills: <strong>${summary.unpaidBills}</strong></span>
    <span>Cash: <strong>${money(summary.cashPaymentsPaise)}</strong></span>
    <span>UPI: <strong>${money(summary.upiPaymentsPaise)}</strong></span>
    <span>Card: <strong>${money(summary.cardPaymentsPaise)}</strong></span>
  `;
}

function renderDevices() {
  const list = $("deviceList");
  if (!list) return;
  list.textContent = "";
  if (state.devices.length === 0) return list.append(emptyNode());
  for (const device of state.devices) {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div>
        <strong>${device.name}</strong><br />
        <small>${device.role} · ${device.status}${device.last_seen_at ? ` · seen ${new Date(device.last_seen_at).toLocaleString()}` : ""}</small>
      </div>
    `;
    if (device.status !== "revoked" && device.id !== "device-local-admin") {
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.className = "danger";
      revoke.textContent = "Revoke";
      revoke.addEventListener("click", async () => {
        await api(`/devices/${device.id}/revoke`, {
          method: "POST",
          body: JSON.stringify({ reason: "Revoked from setup" })
        });
        await loadBootstrap();
      });
      row.append(revoke);
    }
    list.append(row);
  }
}

function renderMenuAdmin() {
  const list = $("menuAdminList");
  if (!list) return;
  list.textContent = "";
  for (const item of state.bootstrap?.menuItems ?? []) {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div>
        <strong>${item.name}</strong><br />
        <small>${item.production_unit_name} · ${money(item.price_paise)} · ${item.active ? "active" : "disabled"}</small>
      </div>
    `;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.textContent = "Edit";
    edit.addEventListener("click", async () => {
      const name = prompt("Item name", item.name);
      if (!name) return;
      const price = prompt("Price in rupees", String(item.price_paise / 100));
      if (price === null) return;
      await api(`/menu-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, pricePaise: Math.round(Number(price) * 100), active: item.active })
      });
      await loadBootstrap();
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = item.active ? "Disable" : "Enable";
    toggle.addEventListener("click", async () => {
      await api(`/menu-items/${item.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active })
      });
      await loadBootstrap();
    });
    row.append(edit, toggle);
    list.append(row);
  }
}

function renderBackups() {
  const list = $("backupList");
  if (!list) return;
  list.textContent = "";
  if (state.backups.length === 0) return list.append(emptyNode());
  for (const backup of state.backups) {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div>
        <strong>${backup.fileName}</strong><br />
        <small>${new Date(backup.createdAt).toLocaleString()} · ${Math.ceil(backup.sizeBytes / 1024)} KB</small>
      </div>
    `;
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "danger";
    restore.textContent = "Schedule Restore";
    restore.addEventListener("click", async () => {
      if (!confirm("Schedule this backup to restore on the next hub restart?")) return;
      await api("/backups/restore", {
        method: "POST",
        body: JSON.stringify({ fileName: backup.fileName })
      });
      alert("Restore scheduled. Restart the hub app to apply it.");
    });
    row.append(restore);
    list.append(row);
  }
}

function renderDay() {
  const day = state.bootstrap?.openDay;
  $("dayStatus").textContent = day ? `POS day open: ${day.id}` : "POS day closed";
  $("openDayForm").style.display = day ? "none" : "flex";
  $("closeDayForm").style.display = day ? "flex" : "none";
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

function renderSetupOptions() {
  const tableFloor = $("tableFloor");
  const menuItemUnit = $("menuItemUnit");
  const selectedFloor = tableFloor.value;
  const selectedUnit = menuItemUnit.value;
  tableFloor.textContent = "";
  menuItemUnit.textContent = "";

  for (const floor of state.bootstrap?.floors ?? []) {
    const option = document.createElement("option");
    option.value = floor.id;
    option.textContent = floor.name;
    tableFloor.append(option);
  }

  for (const unit of state.bootstrap?.productionUnits ?? []) {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = unit.name;
    menuItemUnit.append(option);
  }

  if (selectedFloor) tableFloor.value = selectedFloor;
  if (selectedUnit) menuItemUnit.value = selectedUnit;
  renderPrinterOptions();
}

function renderPrinterOptions() {
  const selects = [$("receiptPrinterName"), $("unitPrinterName")].filter(Boolean);
  for (const select of selects) {
    const current = select.value;
    select.textContent = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = state.systemPrinters.length ? "Select PC printer" : "No PC printers loaded";
    select.append(blank);
    for (const printer of state.systemPrinters) {
      const option = document.createElement("option");
      option.value = printer.name;
      option.textContent = `${printer.displayName}${printer.isDefault ? " (default)" : ""}`;
      select.append(option);
    }
    if (current) select.value = current;
  }
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

async function renderReceiptPrinter() {
  const settings = await api("/settings/receipt-printer");
  $("receiptPrinterName").value = settings.printerName ?? "";
  $("receiptHost").value = settings.printerHost ?? "";
  $("receiptPort").value = settings.printerPort ?? 9100;
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
    const reprint = document.createElement("button");
    reprint.type = "button";
    reprint.textContent = "reprint";
    reprint.addEventListener("click", async () => {
      await api(`/kot/${kot.id}/reprint`, {
        method: "POST",
        body: JSON.stringify({ reason: "KDS reprint", requestedBy: "cashier-1" })
      });
      await loadBootstrap();
    });
    actions.append(reprint);
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

$("closeDayForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/pos-days/close", {
    method: "POST",
    body: JSON.stringify({
      closingCashPaise: Number($("closingCash").value || 0) * 100,
      closedBy: "cashier-1"
    })
  });
  state.selectedOrder = null;
  state.draft.clear();
  await loadBootstrap();
  renderOrder();
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

$("reprintBill").addEventListener("click", async () => {
  const bill = state.selectedOrder?.bill;
  if (!bill) return;
  await api(`/bills/${bill.id}/reprint`, {
    method: "POST",
    body: JSON.stringify({ reason: "Cashier reprint", requestedBy: "cashier-1" })
  });
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
$("deviceToken").addEventListener("change", () => {
  localStorage.setItem("deviceToken", $("deviceToken").value);
  void loadBootstrap();
});
$("kdsUnit").addEventListener("change", loadKds);
$("processPrints").addEventListener("click", async () => {
  await api("/print-jobs/process", { method: "POST" });
  await loadBootstrap();
});
$("loadPrinters").addEventListener("click", loadSystemPrinters);
$("receiptPrinterForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/settings/receipt-printer", {
    method: "PUT",
    body: JSON.stringify({
      printerMode: $("receiptPrinterName").value ? "system" : "network",
      printerName: $("receiptPrinterName").value || undefined,
      printerHost: $("receiptHost").value,
      printerPort: Number($("receiptPort").value || 9100)
    })
  });
  await loadBootstrap();
});
$("floorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/floors", {
    method: "POST",
    body: JSON.stringify({ name: $("floorName").value })
  });
  $("floorName").value = "";
  await loadBootstrap();
});
$("tableForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/tables", {
    method: "POST",
    body: JSON.stringify({ floorId: $("tableFloor").value, name: $("tableName").value })
  });
  $("tableName").value = "";
  await loadBootstrap();
});
$("unitForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/production-units", {
    method: "POST",
    body: JSON.stringify({
      name: $("unitName").value,
      printerMode: $("unitPrinterName").value ? "system" : "network",
      printerName: $("unitPrinterName").value || undefined,
      printerHost: $("unitHost").value,
      printerPort: Number($("unitPort").value || 9100),
      kdsEnabled: true
    })
  });
  $("unitName").value = "";
  $("unitHost").value = "";
  $("unitPort").value = "9100";
  await loadBootstrap();
});
$("menuItemForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/menu-items", {
    method: "POST",
    body: JSON.stringify({
      name: $("menuItemName").value,
      pricePaise: Number($("menuItemPrice").value || 0) * 100,
      productionUnitId: $("menuItemUnit").value,
      active: true
    })
  });
  $("menuItemName").value = "";
  $("menuItemPrice").value = "";
  await loadBootstrap();
});
$("pairingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await api("/devices/pairing-codes", {
    method: "POST",
    body: JSON.stringify({
      deviceName: $("pairingName").value || "New device",
      role: $("pairingRole").value,
      expiresInMinutes: 10
    })
  });
  $("pairingResult").textContent = `Code ${result.code} expires ${new Date(result.expiresAt).toLocaleTimeString()}`;
  await loadAdminPanels();
});

$("backupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/backups", {
    method: "POST",
    body: JSON.stringify({ label: $("backupLabel").value || "manual" })
  });
  $("backupLabel").value = "";
  await loadAdminPanels();
});

$("pullCloud").addEventListener("click", async () => {
  const result = await api("/sync/pull", { method: "POST" });
  alert(result.skipped ? "Cloud pull skipped. Check Convex URL, POS secret, and installation id." : `Applied ${result.applied} cloud changes.`);
  await loadBootstrap();
});

const protocol = location.protocol === "https:" ? "wss:" : "ws:";
const realtimeToken = localStorage.getItem("deviceToken") || "dev-admin-token";
const realtime = new WebSocket(`${protocol}//${location.host}/realtime`, [`pos-token.${realtimeToken}`]);
realtime.addEventListener("message", () => {
  void loadBootstrap();
});

loadBootstrap().catch((error) => {
  $("hubHealth").textContent = error.message;
});

for (const item of document.querySelectorAll(".nav-item")) {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    item.classList.add("active");
    $(item.dataset.view).classList.add("active");
  });
}
