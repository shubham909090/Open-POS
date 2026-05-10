const state = {
  bootstrap: null,
  selectedTableId: null,
  selectedOrder: null,
  draft: new Map(),
  systemPrinters: [],
  devices: [],
  backups: [],
  closeSummary: null,
  menuSearch: ""
};

const $ = (id) => document.getElementById(id);
const money = (paise) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((paise ?? 0) / 100);
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

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
  renderOperationalStats();
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

function showToast(message, type = "ok") {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "error" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.className = "toast";
  }, 2600);
}

async function runAction(action, successMessage) {
  try {
    const result = await action();
    if (successMessage) showToast(successMessage);
    return result;
  } catch (error) {
    showToast(error.message ?? "Action failed", "error");
    return undefined;
  }
}

function renderOperationalStats() {
  const tables = state.bootstrap?.tables ?? [];
  const printJobs = state.bootstrap?.printJobs ?? [];
  const pending = state.bootstrap?.syncStatus?.counts?.pending ?? 0;
  $("metricTables").textContent = String(tables.length);
  $("metricOccupied").textContent = String(tables.filter((table) => table.status !== "free").length);
  $("metricFailedPrints").textContent = String(printJobs.filter((job) => job.status === "failed").length);
  $("metricSync").textContent = String(pending);
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
  const closingCashPaise = Number($("closingCash")?.value || 0) * 100;
  const hasClosingCash = $("closingCash")?.value !== "";
  const variancePaise = hasClosingCash ? closingCashPaise - summary.expectedClosingCashPaise : 0;
  const canClose = summary.openOrders === 0 && summary.unpaidBills === 0;
  target.innerHTML = `
    <span>Opening cash <strong>${money(summary.openingCashPaise)}</strong></span>
    <span>Cash sales <strong>${money(summary.cashPaymentsPaise)}</strong></span>
    <span>Expected drawer <strong>${money(summary.expectedClosingCashPaise)}</strong></span>
    <span>Typed variance <strong class="${variancePaise === 0 ? "" : variancePaise > 0 ? "positive" : "negative"}">${hasClosingCash ? money(variancePaise) : "Enter closing cash"}</strong></span>
    <span>UPI <strong>${money(summary.upiPaymentsPaise)}</strong></span>
    <span>Card <strong>${money(summary.cardPaymentsPaise)}</strong></span>
    <span>Online <strong>${money(summary.onlinePaymentsPaise)}</strong></span>
    <span>Total payments <strong>${money(summary.totalPaymentsPaise)}</strong></span>
    <span>Gross bills <strong>${money(summary.grossSalesPaise)}</strong></span>
    <span>Discounts <strong>${money(summary.discountPaise)}</strong></span>
    <span>Tips <strong>${money(summary.tipPaise)}</strong></span>
    <span>Final sales <strong>${money(summary.finalSalesPaise)}</strong></span>
    <span>Paid bills <strong>${summary.paidBills}</strong></span>
    <span>Open orders <strong class="${summary.openOrders ? "negative" : ""}">${summary.openOrders}</strong></span>
    <span>Unpaid bills <strong class="${summary.unpaidBills ? "negative" : ""}">${summary.unpaidBills}</strong></span>
    <span>Close status <strong class="${canClose ? "positive" : "negative"}">${canClose ? "Ready" : "Blocked"}</strong></span>
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

function renderModifierAdmin() {
  const list = $("modifierAdminList");
  if (!list) return;
  list.textContent = "";
  const groups = state.bootstrap?.modifierGroups ?? [];
  const notes = state.bootstrap?.noteTemplates ?? [];
  if (groups.length === 0 && notes.length === 0) return list.append(emptyNode());
  for (const group of groups) {
    const row = document.createElement("div");
    row.className = "admin-row";
    const options = (group.options ?? [])
      .map((option) => `${option.name}${option.price_delta_paise ? ` +${money(option.price_delta_paise)}` : ""}`)
      .join(", ");
    row.innerHTML = `
      <div>
        <strong>${group.name}</strong><br />
        <small>${group.selection_type} · ${options || "No options yet"}</small>
      </div>
    `;
    list.append(row);
  }
  for (const note of notes) {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div>
        <strong>Note: ${note.label}</strong><br />
        <small>${note.note}</small>
      </div>
    `;
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
    tile.innerHTML = `<strong>${table.name}</strong><span>${table.floor_name} · ${table.status.replaceAll("_", " ")}</span>`;
    tile.addEventListener("click", () => selectTable(table.id));
    tables.append(tile);
  }
}

function renderMenu() {
  const menu = $("menu");
  menu.textContent = "";
  const query = state.menuSearch.trim().toLowerCase();
  for (const item of state.bootstrap?.menuItems ?? []) {
    if (!item.active) continue;
    if (query && !`${item.name} ${item.production_unit_name}`.toLowerCase().includes(query)) continue;
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
  const modifierOptionGroup = $("modifierOptionGroup");
  const modifierAssignItem = $("modifierAssignItem");
  const modifierAssignGroup = $("modifierAssignGroup");
  const selectedFloor = tableFloor.value;
  const selectedUnit = menuItemUnit.value;
  const selectedOptionGroup = modifierOptionGroup?.value;
  const selectedAssignItem = modifierAssignItem?.value;
  const selectedAssignGroup = modifierAssignGroup?.value;
  tableFloor.textContent = "";
  menuItemUnit.textContent = "";
  if (modifierOptionGroup) modifierOptionGroup.textContent = "";
  if (modifierAssignItem) modifierAssignItem.textContent = "";
  if (modifierAssignGroup) modifierAssignGroup.textContent = "";

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

  for (const group of state.bootstrap?.modifierGroups ?? []) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    modifierOptionGroup?.append(option.cloneNode(true));
    modifierAssignGroup?.append(option);
  }

  for (const item of state.bootstrap?.menuItems ?? []) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    modifierAssignItem?.append(option);
  }

  if (selectedFloor) tableFloor.value = selectedFloor;
  if (selectedUnit) menuItemUnit.value = selectedUnit;
  if (selectedOptionGroup && modifierOptionGroup) modifierOptionGroup.value = selectedOptionGroup;
  if (selectedAssignItem && modifierAssignItem) modifierAssignItem.value = selectedAssignItem;
  if (selectedAssignGroup && modifierAssignGroup) modifierAssignGroup.value = selectedAssignGroup;
  renderPrinterOptions();
  renderModifierAdmin();
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
  renderPaymentPanel();
}

function hydrateDraftFromOrder() {
  state.draft = new Map();
  const items = state.selectedOrder?.items ?? [];
  for (const item of items) {
    if (item.status === "cancelled") continue;
    const modifiers = JSON.parse(item.modifiers_json || "[]");
    state.draft.set(draftKey(item.menu_item_id, item.notes ?? "", modifiers), {
      menuItemId: item.menu_item_id,
      name: item.name_snapshot,
      quantity: item.quantity,
      notes: item.notes ?? "",
      basePricePaise: item.unit_price_paise - (item.modifier_total_paise ?? 0),
      pricePaise: item.unit_price_paise,
      modifiers
    });
  }
}

function draftKey(menuItemId, notes = "", modifiers = []) {
  return `${menuItemId}::${notes.trim()}::${JSON.stringify(modifiers)}`;
}

function modifierGroupsForItem(menuItemId) {
  const item = state.bootstrap?.menuItems?.find((entry) => entry.id === menuItemId);
  const ids = new Set(item?.modifier_group_ids ?? []);
  return (state.bootstrap?.modifierGroups ?? []).filter((group) => ids.has(group.id) && group.active);
}

function priceWithModifiers(menuItem, modifiers) {
  return menuItem.price_paise + modifiers.reduce((total, modifier) => total + (modifier.priceDeltaPaise ?? modifier.price_delta_paise ?? 0), 0);
}

function addDraftItem(menuItem) {
  if (!state.selectedTableId) return;
  const modifiers = [];
  const key = draftKey(menuItem.id, "", modifiers);
  const current = state.draft.get(key);
  state.draft.set(key, {
    menuItemId: menuItem.id,
    name: menuItem.name,
    quantity: (current?.quantity ?? 0) + 1,
    notes: "",
    basePricePaise: menuItem.price_paise,
    pricePaise: menuItem.price_paise,
    modifiers
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

function replaceDraftItem(key, next) {
  state.draft.delete(key);
  const menuItem = state.bootstrap?.menuItems?.find((item) => item.id === next.menuItemId);
  const pricePaise = menuItem ? priceWithModifiers(menuItem, next.modifiers ?? []) : next.pricePaise;
  const updated = { ...next, pricePaise };
  const nextKey = draftKey(updated.menuItemId, updated.notes, updated.modifiers ?? []);
  const existing = state.draft.get(nextKey);
  state.draft.set(nextKey, existing ? { ...updated, quantity: existing.quantity + updated.quantity } : updated);
  renderOrder();
}

function toggleModifier(key, group, option) {
  const current = state.draft.get(key);
  if (!current) return;
  const existing = current.modifiers ?? [];
  const withoutGroupOption = existing.filter((modifier) =>
    group.selection_type === "single" ? modifier.groupId !== group.id : modifier.optionId !== option.id
  );
  const isSelected = existing.some((modifier) => modifier.groupId === group.id && modifier.optionId === option.id);
  const nextModifiers = isSelected
    ? withoutGroupOption
    : [
        ...withoutGroupOption,
        {
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionName: option.name,
          priceDeltaPaise: option.price_delta_paise
        }
      ].sort((left, right) => `${left.groupName}:${left.optionName}`.localeCompare(`${right.groupName}:${right.optionName}`));
  replaceDraftItem(key, { ...current, modifiers: nextModifiers });
}

function updateDraftNotes(key, notes) {
  const current = state.draft.get(key);
  if (!current) return;
  replaceDraftItem(key, { ...current, notes });
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
  const total = entries.reduce((sum, [, item]) => sum + item.pricePaise * item.quantity, 0);
  if ($("draftTotal")) $("draftTotal").textContent = money(total);
  if (entries.length === 0) {
    renderBillingContext();
    return list.append(emptyNode());
  }

  for (const [key, item] of entries) {
    const row = document.createElement("div");
    row.className = "draft-item";
    const groups = modifierGroupsForItem(item.menuItemId);
    const selected = new Set((item.modifiers ?? []).map((modifier) => `${modifier.groupId}:${modifier.optionId}`));
    const modifierHtml = groups
      .map(
        (group) => `
          <div class="modifier-line">
            <span>${group.name}</span>
            <div>
              ${(group.options ?? [])
                .filter((option) => option.active)
                .map(
                  (option) => `
                    <button type="button" class="modifier-chip ${selected.has(`${group.id}:${option.id}`) ? "active" : ""}"
                      data-group="${group.id}" data-option="${option.id}">
                      ${option.name}${option.price_delta_paise ? ` +${money(option.price_delta_paise)}` : ""}
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
        `
      )
      .join("");
    const noteButtons = (state.bootstrap?.noteTemplates ?? [])
      .map((note) => `<button type="button" class="note-chip" data-note="${note.note}">${note.label}</button>`)
      .join("");
    row.innerHTML = `
      <div class="draft-main">
        <strong>${item.name}</strong>
        <small>${money(item.pricePaise)} each</small>
        ${modifierHtml ? `<div class="modifier-list">${modifierHtml}</div>` : ""}
        ${noteButtons ? `<div class="note-chip-row">${noteButtons}</div>` : ""}
        <input class="draft-note" value="${escapeHtml(item.notes ?? "")}" placeholder="Kitchen note" />
      </div>
      <span>${item.quantity}</span>
    `;
    for (const chip of row.querySelectorAll(".modifier-chip")) {
      chip.addEventListener("click", () => {
        const group = groups.find((entry) => entry.id === chip.dataset.group);
        const option = group?.options?.find((entry) => entry.id === chip.dataset.option);
        if (group && option) toggleModifier(key, group, option);
      });
    }
    for (const chip of row.querySelectorAll(".note-chip")) {
      chip.addEventListener("click", () => {
        const current = state.draft.get(key);
        const note = chip.dataset.note ?? "";
        const next = [current?.notes, note].filter(Boolean).join(" | ");
        updateDraftNotes(key, next);
      });
    }
    row.querySelector(".draft-note")?.addEventListener("change", (event) => updateDraftNotes(key, event.target.value));
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
  renderPaymentPanel();
  renderBillingContext();
}

function renderBillingContext() {
  const target = $("billingContext");
  if (!target) return;
  const order = state.selectedOrder?.order;
  const table = state.bootstrap?.tables?.find((item) => item.id === state.selectedTableId);
  if (!table) {
    target.textContent = "No table selected.";
    $("billingMeta").textContent = "Select a table in Service to bill or settle.";
    return;
  }
  const bill = state.selectedOrder?.bill;
  target.innerHTML = `
    <strong>Table ${table.name}</strong>
    <span>${order ? `${order.status} order ${order.id}` : "No active order"}</span>
    <span>${bill ? `Bill ${bill.status} · ${money(bill.final_total_paise || bill.total_paise)}` : "No bill generated"}</span>
  `;
  $("billingMeta").textContent = bill ? `Bill ${bill.status}` : order ? `Order ${order.status}` : "No active order";
}

function renderPaymentPanel() {
  const bill = state.selectedOrder?.bill;
  const payments = state.selectedOrder?.payments ?? [];
  const summary = $("paymentSummary");
  if (!summary) return;

  if (!bill) {
    summary.textContent = "Select a billed order.";
    for (const id of ["billDiscount", "billTip", "payCash", "payUpi", "payCard", "payOnline", "paymentReference"]) {
      if ($(id)) $(id).value = id === "paymentReference" ? "" : "0";
    }
    renderBillingContext();
    return;
  }

  const paid = bill.paid_paise ?? payments.reduce((total, payment) => total + (payment.amount_paise ?? 0), 0);
  const finalTotal = bill.final_total_paise || bill.total_paise;
  const remaining = Math.max(0, finalTotal - paid);
  summary.innerHTML = `
    <span>Bill <strong>${bill.id}</strong></span>
    <span>Total <strong>${money(finalTotal)}</strong></span>
    <span>Paid <strong>${money(paid)}</strong></span>
    <span>Remaining <strong>${money(remaining)}</strong></span>
  `;
  $("billDiscount").value = String((bill.discount_paise ?? 0) / 100);
  $("billTip").value = String((bill.tip_paise ?? 0) / 100);
  for (const id of ["payCash", "payUpi", "payCard", "payOnline"]) $(id).value = "0";
  $("paymentReference").value = "";
  renderBillingContext();
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
        ${(kot.items ?? [])
          .map(
            (item) =>
              `<li>${item.quantity_delta} x ${escapeHtml(item.name_snapshot)}${item.notes ? `<br /><small>${escapeHtml(item.notes)}</small>` : ""}</li>`
          )
          .join("")}
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
  await runAction(async () => {
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
  }, "POS day opened");
});

$("closeDayForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
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
  }, "POS day closed");
});

$("submitOrder").addEventListener("click", async () => {
  if (!state.selectedTableId) return;
  await runAction(async () => {
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
          notes: item.notes,
          modifiers: (item.modifiers ?? []).map((modifier) => ({
            groupId: modifier.groupId,
            optionId: modifier.optionId
          }))
        }))
      })
    });
    await loadBootstrap();
    await selectTable(state.selectedTableId);
  }, "KOT sent");
});

$("generateBill").addEventListener("click", async () => {
  const orderId = state.selectedOrder?.order?.id;
  if (!orderId) return;
  await runAction(async () => {
    await api(`/bills/${orderId}/generate`, { method: "POST" });
    await selectTable(state.selectedTableId);
    await loadBootstrap();
  }, "Bill generated");
});

$("reprintBill").addEventListener("click", async () => {
  const bill = state.selectedOrder?.bill;
  if (!bill) return;
  await runAction(async () => {
    await api(`/bills/${bill.id}/reprint`, {
      method: "POST",
      body: JSON.stringify({ reason: "Cashier reprint", requestedBy: "cashier-1" })
    });
    await loadBootstrap();
  }, "Bill reprint queued");
});

$("settleBill").addEventListener("click", async () => {
  const bill = state.selectedOrder?.bill;
  if (!bill) return;
  const payments = [
    { method: "cash", amountPaise: Number($("payCash").value || 0) * 100 },
    { method: "upi", amountPaise: Number($("payUpi").value || 0) * 100 },
    { method: "card", amountPaise: Number($("payCard").value || 0) * 100 },
    { method: "online", amountPaise: Number($("payOnline").value || 0) * 100 }
  ]
    .filter((payment) => payment.amountPaise > 0)
    .map((payment) => ({
      ...payment,
      reference: $("paymentReference").value || undefined
    }));
  await runAction(async () => {
    await api(`/bills/${bill.id}/settle`, {
      method: "POST",
      body: JSON.stringify({
        discountPaise: Number($("billDiscount").value || 0) * 100,
        tipPaise: Number($("billTip").value || 0) * 100,
        payments,
        receivedBy: "cashier-1"
      })
    });
    await loadBootstrap();
    if (state.selectedTableId) await selectTable(state.selectedTableId);
    renderOrder();
  }, "Payment saved");
});

$("cancelOrder").addEventListener("click", async () => {
  const orderId = state.selectedOrder?.order?.id;
  if (!orderId) return;
  await runAction(async () => {
    await api(`/orders/${orderId}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Cancelled from cashier" }) });
    state.selectedOrder = null;
    state.draft.clear();
    await loadBootstrap();
    renderOrder();
  }, "Order cancelled");
});

$("refresh").addEventListener("click", loadBootstrap);
$("menuSearch").addEventListener("input", () => {
  state.menuSearch = $("menuSearch").value;
  renderMenu();
});
$("closingCash").addEventListener("input", renderCloseSummary);
$("deviceToken").addEventListener("change", () => {
  localStorage.setItem("deviceToken", $("deviceToken").value);
  void loadBootstrap();
});
$("kdsUnit").addEventListener("change", loadKds);
$("processPrints").addEventListener("click", async () => {
  await runAction(async () => {
    await api("/print-jobs/process", { method: "POST" });
    await loadBootstrap();
  }, "Print queue processed");
});
$("loadPrinters").addEventListener("click", loadSystemPrinters);
$("receiptPrinterForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
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
  }, "Receipt printer saved");
});
$("floorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    await api("/floors", {
      method: "POST",
      body: JSON.stringify({ name: $("floorName").value })
    });
    $("floorName").value = "";
    await loadBootstrap();
  }, "Floor added");
});
$("tableForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    await api("/tables", {
      method: "POST",
      body: JSON.stringify({ floorId: $("tableFloor").value, name: $("tableName").value })
    });
    $("tableName").value = "";
    await loadBootstrap();
  }, "Table added");
});
$("unitForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
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
  }, "Production unit added");
});
$("menuItemForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
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
  }, "Menu item added");
});
$("modifierGroupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    const selectionType = $("modifierGroupType").value;
    await api("/modifier-groups", {
      method: "POST",
      body: JSON.stringify({
        name: $("modifierGroupName").value,
        selectionType,
        minSelections: 0,
        maxSelections: selectionType === "single" ? 1 : 20,
        active: true
      })
    });
    $("modifierGroupName").value = "";
    await loadBootstrap();
  }, "Modifier group added");
});
$("modifierOptionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    await api("/modifier-options", {
      method: "POST",
      body: JSON.stringify({
        groupId: $("modifierOptionGroup").value,
        name: $("modifierOptionName").value,
        priceDeltaPaise: Number($("modifierOptionPrice").value || 0) * 100,
        active: true
      })
    });
    $("modifierOptionName").value = "";
    $("modifierOptionPrice").value = "";
    await loadBootstrap();
  }, "Modifier option added");
});
$("modifierAssignForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    await api("/menu-item-modifier-groups", {
      method: "POST",
      body: JSON.stringify({
        menuItemId: $("modifierAssignItem").value,
        groupId: $("modifierAssignGroup").value
      })
    });
    await loadBootstrap();
  }, "Modifier attached to item");
});
$("noteTemplateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    await api("/note-templates", {
      method: "POST",
      body: JSON.stringify({
        label: $("noteTemplateLabel").value,
        note: $("noteTemplateNote").value,
        active: true
      })
    });
    $("noteTemplateLabel").value = "";
    $("noteTemplateNote").value = "";
    await loadBootstrap();
  }, "Note template added");
});
$("pairingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    const result = await api("/devices/pairing-codes", {
      method: "POST",
      body: JSON.stringify({
        deviceName: $("pairingName").value || "New device",
        role: $("pairingRole").value,
        expiresInMinutes: 10
      })
    });
    $("pairingResult").innerHTML = `
      <div class="pairing-card">
        <img src="${result.qrDataUrl}" alt="Device pairing QR code" />
        <div>
          <strong>Code ${result.code}</strong>
          <span>Scan QR or enter code manually. Expires ${new Date(result.expiresAt).toLocaleTimeString()}.</span>
          <textarea readonly>${result.pairingPayloadText}</textarea>
        </div>
      </div>
    `;
    await loadAdminPanels();
  }, "Pairing code created");
});

$("backupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    await api("/backups", {
      method: "POST",
      body: JSON.stringify({ label: $("backupLabel").value || "manual" })
    });
    $("backupLabel").value = "";
    await loadAdminPanels();
  }, "Backup created");
});

$("pullCloud").addEventListener("click", async () => {
  await runAction(async () => {
    const result = await api("/sync/pull", { method: "POST" });
    showToast(result.skipped ? "Cloud pull skipped. Check Convex env." : `Applied ${result.applied} cloud changes.`);
    await loadBootstrap();
  });
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
