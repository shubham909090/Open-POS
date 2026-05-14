const state = {
  bootstrap: null,
  selectedTableId: null,
  selectedOrder: null,
  draft: new Map(),
  systemPrinters: [],
  devices: [],
  backups: [],
  closeSummary: null,
  menuSearch: "",
  receiptPrinter: null,
  activeSetupStep: null,
  manualSetupStep: false,
  printerSkipped: localStorage.getItem("printerSetupSkipped") === "1",
  editing: {}
};

const $ = (id) => document.getElementById(id);
const money = (paise) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((paise ?? 0) / 100);
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

async function api(path, options = {}) {
  const token = $("deviceToken")?.value || localStorage.getItem("deviceToken") || "dev-admin-token";
  const headers = {
    "x-device-token": token,
    ...(options.headers ?? {})
  };
  if (options.body) headers["content-type"] = "application/json";
  const response = await fetch(path, {
    ...options,
    headers
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
  if ($("setupDeviceToken")) {
    $("setupDeviceToken").value = $("deviceToken")?.value || localStorage.getItem("deviceToken") || "";
  }
  try {
    state.bootstrap = await api("/sync/bootstrap");
  } catch (error) {
    renderLockedHub(error);
    return;
  }
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
  renderSetupProgress();
}

function renderLockedHub(error) {
  localStorage.removeItem("deviceToken");
  if ($("deviceToken")) $("deviceToken").value = "";
  if ($("setupDeviceToken")) $("setupDeviceToken").value = "";
  state.bootstrap = null;
  state.selectedTableId = null;
  state.selectedOrder = null;
  state.draft.clear();
  state.devices = [];
  state.backups = [];
  state.closeSummary = null;
  $("hubHealth").textContent = "Hub locked";
  $("syncStatus").textContent = "Enter hub password";
  $("dayStatus").textContent = "Business day locked";
  renderOperationalStats();
  renderTables();
  renderMenu();
  renderUnits();
  renderPrinterOptions();
  renderPrintJobs();
  renderSetupProgress();
  const message = error instanceof Error && error.message.includes("Invalid or revoked")
    ? "Enter the current HUB_ADMIN_TOKEN from the hub env file."
    : error?.message || "Enter the hub password to continue.";
  showToast(message, "error");
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
    if (successMessage) showToast(typeof successMessage === "function" ? successMessage(result) : successMessage);
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

function isDryRunPrinting() {
  return Boolean(state.bootstrap?.setup?.printerDryRun);
}

function setupSteps() {
  const hasToken = Boolean(($("deviceToken")?.value || localStorage.getItem("deviceToken") || "").trim());
  const hasDay = Boolean(state.bootstrap?.currentBusinessDay);
  const hasPrinter = Boolean(state.receiptPrinter?.printerName || state.receiptPrinter?.printerHost);
  const printerCanBeSkipped = isDryRunPrinting();
  const printerReady = hasPrinter || printerCanBeSkipped;
  const hasKitchens = (state.bootstrap?.productionUnits ?? []).some((unit) => unit.active);
  const hasTables = (state.bootstrap?.tables ?? []).some((table) => table.active);
  const hasMenu = (state.bootstrap?.menuItems ?? []).some((item) => item.active);
  const pairedDevices = (state.devices ?? []).filter((device) => device.id !== "device-local-admin" && device.status !== "revoked");
  const hasDevices = pairedDevices.length > 0;
  const coreReady = hasToken && hasDay && printerReady && hasTables && hasMenu;
  return [
    {
      key: "unlock",
      label: "Unlock Hub",
      done: hasToken,
      required: true,
      hint: hasToken ? "Hub unlocked" : "Enter the hub password",
      missing: "Unlock the hub with the password from the hub PC env file."
    },
    {
      key: "day",
      label: "Business Day",
      done: hasDay,
      required: true,
      hint: hasDay ? "Automatic 6 AM IST day is active" : "Hub will create the business day automatically",
      missing: "The hub must load the current 6 AM IST business day."
    },
    {
      key: "printer",
      label: "Choose Cash Counter Printer",
      done: printerReady,
      required: true,
      hint: hasPrinter ? "Bill printer saved" : printerCanBeSkipped ? "Dry-run printing is on" : "Pick the bill printer",
      missing: "Choose the cash counter printer, or enter the printer IP in Advanced."
    },
    {
      key: "kitchens",
      label: "Add Kitchens / Bar Counters",
      done: hasKitchens,
      required: false,
      hint: hasKitchens ? `${state.bootstrap.productionUnits.length} ready` : "Optional: add kitchen routing later",
      missing: "Add a kitchen or counter when you want KOT printing."
    },
    {
      key: "tables",
      label: "Add Tables",
      done: hasTables,
      required: true,
      hint: hasTables ? `${state.bootstrap.tables.length} tables` : "Add your first table",
      missing: "Add at least one table before taking orders."
    },
    {
      key: "menu",
      label: "Add Menu Items",
      done: hasMenu,
      required: true,
      hint: hasMenu ? `${state.bootstrap.menuItems.length} dishes` : "Add dishes and routing",
      missing: "Add at least one dish and choose its kitchen or counter."
    },
    {
      key: "devices",
      label: "Pair Devices",
      done: hasDevices,
      required: false,
      hint: hasDevices ? `${pairedDevices.length} paired` : "Optional: pair phones when ready",
      missing: "Pair waiter or kitchen devices when you want phones or kitchen screens."
    },
    {
      key: "ready",
      label: "Ready For Service",
      done: coreReady,
      required: true,
      hint: coreReady ? "Service can start" : "Finish the required setup"
    }
  ];
}

function missingRequiredSteps() {
  return setupSteps().filter((step) => step.key !== "ready" && step.required !== false && !step.done);
}

function focusNextSetupStep() {
  const missing = missingRequiredSteps();
  state.activeSetupStep = missing[0]?.key ?? "ready";
  state.manualSetupStep = false;
  renderSetupProgress();
}

function keepSetupStep(stepKey) {
  state.activeSetupStep = stepKey;
  state.manualSetupStep = true;
  renderSetupProgress();
}

function setActiveSetupStep(stepKey) {
  state.activeSetupStep = stepKey;
  state.manualSetupStep = true;
  renderSetupProgress();
}

function switchView(viewId) {
  const protectedViews = new Set(["serviceView", "kitchenView", "billingView"]);
  const missing = missingRequiredSteps();
  if (protectedViews.has(viewId) && missing.length > 0) {
    state.activeSetupStep = missing[0].key;
    state.manualSetupStep = false;
    renderSetupProgress();
    showToast(`Finish setup first: ${missing[0].missing}`, "error");
    viewId = "setupView";
  }
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
}

function renderSetupProgress() {
  const steps = setupSteps();
  const requiredSteps = steps.filter((step) => step.key !== "ready" && step.required !== false);
  const firstIncomplete = requiredSteps.find((step) => !step.done)?.key ?? "ready";
  if (!steps.some((step) => step.key === state.activeSetupStep)) state.activeSetupStep = firstIncomplete;
  if (!state.manualSetupStep && state.activeSetupStep !== "ready" && steps.find((step) => step.key === state.activeSetupStep)?.done) {
    state.activeSetupStep = firstIncomplete;
  }

  const checklist = $("setupChecklist");
  if (checklist) {
    checklist.textContent = "";
    for (const [index, step] of steps.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `check-step ${step.done ? "done" : ""} ${step.key === state.activeSetupStep ? "active" : ""}`;
      const statusLabel = step.done ? "Done" : step.required === false ? "Optional" : `Step ${index + 1}`;
      button.innerHTML = `
        <span>${statusLabel}</span>
        <strong>${step.label}</strong>
        <small>${step.done || step.required === false ? step.hint : step.missing}</small>
      `;
      button.addEventListener("click", () => setActiveSetupStep(step.key));
      checklist.append(button);
    }
  }

  for (const step of document.querySelectorAll("[data-setup-step]")) {
    const key = step.dataset.setupStep;
    const model = steps.find((entry) => entry.key === key);
    step.classList.toggle("active", key === state.activeSetupStep);
    step.classList.toggle("complete", Boolean(model?.done));
    step.classList.toggle("collapsed", Boolean(model?.done) && key !== state.activeSetupStep);
    step.classList.toggle("locked", !model?.done && key !== state.activeSetupStep);
  }

  const readyMessage = $("readyMessage");
  if (readyMessage) {
    const ready = steps.find((step) => step.key === "ready")?.done;
    const missing = missingRequiredSteps();
    if (ready) {
      readyMessage.className = "ready-panel ready";
      readyMessage.innerHTML = "<strong>Service can start.</strong><span>You can take orders, send kitchen tickets, and settle bills from this PC. Pair phones later if you need them.</span>";
    } else {
      readyMessage.className = "ready-panel missing";
      readyMessage.innerHTML = `
        <strong>${missing.length} required step${missing.length === 1 ? "" : "s"} left</strong>
        <ul class="ready-list">
          ${missing.map((step) => `<li><span>${escapeHtml(step.label)}</span><small>${escapeHtml(step.missing)}</small></li>`).join("")}
        </ul>
      `;
    }
  }
  if ($("goService")) {
    const ready = steps.find((step) => step.key === "ready")?.done;
    $("goService").disabled = !ready;
    $("goService").textContent = ready ? "Go To Take Orders" : "Finish Required Steps First";
  }
  renderPrinterSetupState();
}

async function loadAdminPanels() {
  const [devices, backups, closeSummary] = await Promise.all([
    api("/devices").catch(() => []),
    api("/backups").catch(() => []),
    api("/business-day/current-summary").catch(() => null)
  ]);
  state.devices = devices;
  state.backups = backups;
  state.closeSummary = closeSummary;
  renderDevices();
  renderUnitAdmin();
  renderFloorAdmin();
  renderTableAdmin();
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
  renderSetupProgress();
  if (state.systemPrinters.length === 0) {
    showToast(
      isDryRunPrinting()
        ? "No PC printers found. Dry-run printing is on, so you can continue setup."
        : "No PC printers found. Install one or use the LAN fallback fields.",
      isDryRunPrinting() ? "ok" : "error"
    );
  }
}

function renderCloseSummary() {
  const targets = [$("closeSummary"), $("closeSummaryReport")].filter(Boolean);
  if (!targets.length) return;
  const summary = state.closeSummary;
  if (!summary?.businessDay) {
    for (const target of targets) target.textContent = "Business day is loading.";
    return;
  }
  const markup = `
    <span>Business date <strong>${escapeHtml(summary.businessDay.business_date)}</strong></span>
    <span>Period start <strong>${new Date(summary.businessDay.period_start_at).toLocaleString()}</strong></span>
    <span>Period end <strong>${new Date(summary.businessDay.period_end_at).toLocaleString()}</strong></span>
    <span>Cash sales <strong>${money(summary.cashPaymentsPaise)}</strong></span>
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
    <span>Finalization <strong>${summary.openOrders || summary.unpaidBills ? "Waits for settlement" : "Ready after 6 AM"}</strong></span>
  `;
  for (const target of targets) target.innerHTML = markup;
}

function renderDevices() {
  const list = $("deviceList");
  if (!list) return;
  list.textContent = "";
  if (state.devices.length === 0) return list.append(emptyNode("No paired devices", "Create a QR code when you are ready to connect waiter or kitchen devices."));
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

function renderUnitAdmin() {
  const list = $("unitAdminList");
  if (!list) return;
  list.textContent = "";
  const units = state.bootstrap?.productionUnits ?? [];
  if (units.length === 0) return list.append(emptyNode("No kitchens yet", "Add the kitchen, bar, or counter that prepares dishes."));
  for (const unit of units) {
    const isEditing = state.editing.unit === unit.id;
    const row = document.createElement("div");
    row.className = "admin-row editable-row";
    if (isEditing) {
      row.innerHTML = `
        <div class="edit-grid">
          <input data-field="name" value="${escapeHtml(unit.name)}" />
          <input data-field="printerHost" value="${escapeHtml(unit.printer_host ?? "")}" placeholder="Printer IP" />
          <input data-field="printerPort" type="number" value="${unit.printer_port ?? 9100}" />
        </div>
      `;
      row.append(editButtons("unit", async () => {
        await api(`/production-units/${unit.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: row.querySelector('[data-field="name"]').value,
            printerHost: row.querySelector('[data-field="printerHost"]').value,
            printerPort: Number(row.querySelector('[data-field="printerPort"]').value || 9100)
          })
        });
      }));
    } else {
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(unit.name)}</strong><br />
          <small>${unit.active ? "active" : "disabled"} · ${escapeHtml(unit.printer_name || unit.printer_host || "No printer selected")}</small>
        </div>
      `;
      row.append(rowActions(
        "unit",
        unit.id,
        async () => api(`/production-units/${unit.id}`, { method: "DELETE" }),
        async () => api(`/production-units/${unit.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: !unit.active })
        }),
        unit.active
      ));
    }
    list.append(row);
  }
}

function renderFloorAdmin() {
  const list = $("floorAdminList");
  if (!list) return;
  list.textContent = "";
  const floors = state.bootstrap?.floors ?? [];
  if (floors.length === 0) return list.append(emptyNode("No floors yet", "Add your first floor."));
  for (const floor of floors) {
    const isEditing = state.editing.floor === floor.id;
    const row = document.createElement("div");
    row.className = "admin-row editable-row";
    if (isEditing) {
      row.innerHTML = `<input data-field="name" value="${escapeHtml(floor.name)}" />`;
      row.append(editButtons("floor", async () => {
        await api(`/floors/${floor.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: row.querySelector('[data-field="name"]').value })
        });
      }));
    } else {
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(floor.name)}</strong><br />
          <small>${floor.active ? "active" : "disabled"}</small>
        </div>
      `;
      row.append(rowActions(
        "floor",
        floor.id,
        async () => api(`/floors/${floor.id}`, { method: "DELETE" }),
        async () => api(`/floors/${floor.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: !floor.active })
        }),
        floor.active
      ));
    }
    list.append(row);
  }
}

function renderTableAdmin() {
  const list = $("tableAdminList");
  if (!list) return;
  list.textContent = "";
  const tables = state.bootstrap?.tables ?? [];
  if (tables.length === 0) return list.append(emptyNode("No tables yet", "Add the tables waiters will use."));
  for (const table of tables) {
    const isEditing = state.editing.table === table.id;
    const row = document.createElement("div");
    row.className = "admin-row editable-row";
    if (isEditing) {
      row.innerHTML = `
        <div class="edit-grid">
          <select data-field="floorId">
            ${(state.bootstrap?.floors ?? []).map((floor) => `<option value="${floor.id}" ${floor.id === table.floor_id ? "selected" : ""}>${escapeHtml(floor.name)}</option>`).join("")}
          </select>
          <input data-field="name" value="${escapeHtml(table.name)}" />
        </div>
      `;
      row.append(editButtons("table", async () => {
        await api(`/tables/${table.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            floorId: row.querySelector('[data-field="floorId"]').value,
            name: row.querySelector('[data-field="name"]').value
          })
        });
      }));
    } else {
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(table.name)}</strong><br />
          <small>${escapeHtml(table.floor_name)} · ${table.status.replaceAll("_", " ")} · ${table.active ? "active" : "disabled"}</small>
        </div>
      `;
      row.append(rowActions(
        "table",
        table.id,
        async () => api(`/tables/${table.id}`, { method: "DELETE" }),
        async () => api(`/tables/${table.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: !table.active })
        }),
        table.active
      ));
    }
    list.append(row);
  }
}

function renderMenuAdmin() {
  const list = $("menuAdminList");
  if (!list) return;
  list.textContent = "";
  const menuItems = state.bootstrap?.menuItems ?? [];
  if (menuItems.length === 0) return list.append(emptyNode("No dishes yet", "Add normal dishes with price. Kitchen can be assigned now or later."));
  for (const item of menuItems) {
    const isEditing = state.editing.menu === item.id;
    const row = document.createElement("div");
    row.className = "admin-row editable-row";
    const unitLabel = item.production_unit_name || "No kitchen assigned";
    if (isEditing) {
      row.innerHTML = `
        <div class="edit-grid">
          <input data-field="name" value="${escapeHtml(item.name)}" />
          <input data-field="price" type="number" min="0" step="1" value="${item.price_paise / 100}" />
          <select data-field="productionUnitId">
            <option value="">No kitchen assigned</option>
            ${(state.bootstrap?.productionUnits ?? [])
              .filter((unit) => unit.active)
              .map((unit) => `<option value="${unit.id}" ${unit.id === item.production_unit_id ? "selected" : ""}>${escapeHtml(unit.name)}</option>`)
              .join("")}
          </select>
        </div>
      `;
      row.append(editButtons("menu", async () => {
        await api(`/menu-items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: row.querySelector('[data-field="name"]').value,
            pricePaise: Number(row.querySelector('[data-field="price"]').value || 0) * 100,
            productionUnitId: row.querySelector('[data-field="productionUnitId"]').value || null
          })
        });
      }));
    } else {
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(item.name)}</strong><br />
          <small>${escapeHtml(unitLabel)} · ${money(item.price_paise)} · ${item.active ? "active" : "disabled"}</small>
        </div>
      `;
      row.append(rowActions(
        "menu",
        item.id,
        async () => api(`/menu-items/${item.id}`, { method: "DELETE" }),
        async () => api(`/menu-items/${item.id}/active`, {
          method: "PATCH",
          body: JSON.stringify({ active: !item.active })
        }),
        item.active
      ));
    }
    list.append(row);
  }
}

function removalMessage(result) {
  if (!result) return "Updated";
  if (result.deleted) return "Removed";
  if (result.active === false) return "Disabled because it already has history";
  return "Updated";
}

function rowActions(kind, id, removeAction, toggleAction, isActive = true) {
  const actions = document.createElement("div");
  actions.className = "row-actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "secondary";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => {
    state.editing[kind] = id;
    loadBootstrap();
  });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.textContent = "Remove";
  remove.addEventListener("click", async () => {
    await runAction(async () => {
      const result = await removeAction();
      await loadBootstrap();
      return result;
    }, removalMessage);
  });
  actions.append(edit);
  if (toggleAction) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "secondary";
    toggle.textContent = isActive ? "Disable" : "Enable";
    toggle.addEventListener("click", async () => {
      await runAction(async () => {
        await toggleAction();
        await loadBootstrap();
      }, isActive ? "Disabled" : "Enabled");
    });
    actions.append(toggle);
  }
  actions.append(remove);
  return actions;
}

function editButtons(kind, saveAction) {
  const actions = document.createElement("div");
  actions.className = "row-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save";
  save.addEventListener("click", async () => {
    await runAction(async () => {
      await saveAction();
      state.editing[kind] = null;
      await loadBootstrap();
    }, "Saved");
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    state.editing[kind] = null;
    loadBootstrap();
  });
  actions.append(save, cancel);
  return actions;
}

function renderBackups() {
  const list = $("backupList");
  if (!list) return;
  list.textContent = "";
  if (state.backups.length === 0) return list.append(emptyNode("No backups yet", "Create a local backup before major menu changes or after closing the day."));
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
  const day = state.bootstrap?.currentBusinessDay;
  $("dayStatus").textContent = day ? `Business day ${day.business_date}` : "Business day loading";
}

function renderTables() {
  const tables = $("tables");
  tables.textContent = "";
  const rows = state.bootstrap?.tables ?? [];
  const activeRows = rows.filter((table) => table.active);
  if (activeRows.length === 0) {
    tables.append(emptyNode("No tables yet", "Add your first table in Setup before taking orders."));
    return;
  }
  for (const table of activeRows) {
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
  if ((state.bootstrap?.menuItems ?? []).length === 0) {
    menu.append(emptyNode("No dishes yet", "Add dishes in Setup."));
    return;
  }
  const query = state.menuSearch.trim().toLowerCase();
  let visible = 0;
  for (const item of state.bootstrap?.menuItems ?? []) {
    if (!item.active) continue;
    if (query && !`${item.name} ${item.production_unit_name}`.toLowerCase().includes(query)) continue;
    visible += 1;
    const row = document.createElement("div");
    row.className = "menu-item";
    row.innerHTML = `
      <div>
        <strong>${item.name}</strong><br />
        <small>${item.production_unit_name || "No kitchen assigned"} · ${money(item.price_paise)}</small>
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
  if (visible === 0) menu.append(emptyNode("No matching dishes", "Try a different search."));
}

function renderUnits() {
  const select = $("kdsUnit");
  const current = select.value;
  select.textContent = "";
  for (const unit of state.bootstrap?.productionUnits ?? []) {
    if (!unit.active) continue;
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
    if (!floor.active) continue;
    const option = document.createElement("option");
    option.value = floor.id;
    option.textContent = floor.name;
    tableFloor.append(option);
  }

  const noKitchen = document.createElement("option");
  noKitchen.value = "";
  noKitchen.textContent = "No kitchen assigned";
  menuItemUnit.append(noKitchen);
  for (const unit of state.bootstrap?.productionUnits ?? []) {
    if (!unit.active) continue;
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
  renderPrinterSetupState();
}

function renderPrinterSetupState() {
  const help = $("printerHelp");
  const skipButton = $("skipPrinter");
  const hasPrinter = Boolean(state.receiptPrinter?.printerName || state.receiptPrinter?.printerHost);
  const dryRun = isDryRunPrinting();
  if (help) {
    help.textContent = hasPrinter
      ? "Cash counter printer is saved. Bills and payment receipts will use this printer."
      : dryRun
        ? "Development dry-run printing is on, so setup can continue without a physical printer. Add the real printer here before restaurant use."
        : "Choose a PC printer, or open Advanced and enter the printer IP address.";
  }
  if (skipButton) {
    skipButton.hidden = !dryRun || hasPrinter;
    skipButton.textContent = state.printerSkipped ? "Dry-Run Printer Skipped" : "Continue Without Printer For Now";
    skipButton.disabled = state.printerSkipped;
  }
}

function renderPrintJobs() {
  const list = $("printJobs");
  list.textContent = "";
  const jobs = state.bootstrap?.printJobs ?? [];
  if (jobs.length === 0) return list.append(emptyNode("No pending prints", "Kitchen tickets and bills will appear here if they need attention."));
  for (const job of jobs) {
    const row = document.createElement("div");
    row.className = "print-job";
    const label = job.target_type === "kot" ? "Kitchen ticket" : job.target_type === "bill" ? "Bill print" : "Print job";
    const printerLabel = job.printer_name || job.printer_host || "Cash counter";
    row.innerHTML = `
      <div>
        <strong>${label}</strong><br />
        <small>${job.status} · attempts ${job.attempts}${job.last_error ? ` · ${job.last_error}` : ""}</small>
      </div>
      <span class="badge">${escapeHtml(printerLabel)}</span>
    `;
    if (job.status === "failed") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Retry";
      retry.addEventListener("click", async () => {
        await api(`/print-jobs/${job.id}/retry`, {
          method: "POST",
          body: JSON.stringify({ requestedBy: "captain-1" })
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
  state.receiptPrinter = settings;
  $("receiptPrinterName").value = settings.printerName ?? "";
  $("receiptHost").value = settings.printerHost ?? "";
  $("receiptPort").value = settings.printerPort ?? 9100;
  renderPrinterSetupState();
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
}

function draftKey(menuItemId) {
  return menuItemId;
}

function addDraftItem(menuItem) {
  if (!state.selectedTableId) return;
  const key = draftKey(menuItem.id);
  const current = state.draft.get(key);
  state.draft.set(key, {
    menuItemId: menuItem.id,
    name: menuItem.name,
    quantity: (current?.quantity ?? 0) + 1,
    basePricePaise: menuItem.price_paise,
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
  const sentList = $("sentItems");
  list.textContent = "";
  if (sentList) sentList.textContent = "";
  const entries = [...state.draft.entries()];
  const draftTotal = entries.reduce((sum, [, item]) => sum + item.pricePaise * item.quantity, 0);
  const sentItems = (state.selectedOrder?.items ?? []).filter((item) => item.status !== "cancelled" && item.quantity > 0);
  const sentTotal = sentItems.reduce((sum, item) => sum + item.unit_price_paise * item.quantity, 0);
  if ($("draftTotal")) $("draftTotal").textContent = money(draftTotal + sentTotal);
  if (entries.length === 0) {
    list.append(emptyNode("No new dishes selected", "Choose dishes from the menu to add more items."));
  }

  for (const [key, item] of entries) {
    const row = document.createElement("div");
    row.className = "draft-item";
    row.innerHTML = `
      <div class="draft-main">
        <strong>${item.name}</strong>
        <small>${money(item.pricePaise)} each · new</small>
      </div>
      <span>${item.quantity}</span>
    `;
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
  if (sentList) {
    if (sentItems.length === 0) {
      sentList.append(emptyNode("No sent items yet", "Sent dishes will stay here after kitchen confirmation."));
    } else {
      for (const item of sentItems) {
        const row = document.createElement("div");
        row.className = "draft-item sent";
        row.innerHTML = `
          <div class="draft-main">
            <strong>${escapeHtml(item.name_snapshot)}</strong>
            <small>${money(item.unit_price_paise)} each · ${escapeHtml(item.production_unit_name || "No kitchen assigned")}</small>
          </div>
          <span>${item.quantity}</span>
        `;
        sentList.append(row);
      }
    }
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
    <span>${order ? `${order.status.replaceAll("_", " ")} order` : "No active order"}</span>
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
    summary.textContent = state.selectedOrder?.order ? "Generate the bill, then choose how the customer paid." : "Select an occupied table.";
    for (const id of ["billDiscount", "billTip", "payCash", "payUpi", "payCard", "payOnline", "paymentReference"]) {
      if ($(id)) $(id).value = id === "paymentReference" ? "" : "0";
    }
    renderBillingContext();
    return;
  }

  const paid = bill.paid_paise ?? payments.reduce((total, payment) => total + (payment.amount_paise ?? 0), 0);
  const finalTotal = currentBillFinalTotal();
  const remaining = Math.max(0, finalTotal - paid);
  summary.innerHTML = `
    <span>Bill <strong>Current bill</strong></span>
    <span>Total <strong>${money(finalTotal)}</strong></span>
    <span>Paid <strong>${money(paid)}</strong></span>
    <span>Remaining <strong>${money(remaining)}</strong></span>
  `;
  if (!$("billDiscount").dataset.touched) $("billDiscount").value = String((bill.discount_paise ?? 0) / 100);
  if ($("discountType") && !$("discountType").dataset.touched) $("discountType").value = "amount";
  if (!$("billTip").dataset.touched) $("billTip").value = String((bill.tip_paise ?? 0) / 100);
  for (const id of ["payCash", "payUpi", "payCard", "payOnline"]) $(id).value = "0";
  $("paymentReference").value = "";
  renderBillingContext();
}

function currentBillFinalTotal() {
  const bill = state.selectedOrder?.bill;
  if (!bill) return 0;
  const discountValue = Number($("billDiscount")?.value || 0);
  const discountPaise =
    $("discountType")?.value === "percent" ? Math.round((bill.total_paise * Math.min(100, discountValue)) / 100) : discountValue * 100;
  const tipPaise = Number($("billTip")?.value || 0) * 100;
  return Math.max(0, bill.total_paise - discountPaise + tipPaise);
}

function currentBillRemaining() {
  const bill = state.selectedOrder?.bill;
  if (!bill) return 0;
  const paid = bill.paid_paise ?? (state.selectedOrder?.payments ?? []).reduce((total, payment) => total + (payment.amount_paise ?? 0), 0);
  return Math.max(0, currentBillFinalTotal() - paid);
}

function fillFullPayment(method) {
  for (const id of ["payCash", "payUpi", "payCard", "payOnline"]) $(id).value = "0";
  const idByMethod = { cash: "payCash", upi: "payUpi", card: "payCard", online: "payOnline" };
  $(idByMethod[method]).value = String(currentBillRemaining() / 100);
}

async function loadKds() {
  const unitId = $("kdsUnit").value || state.bootstrap?.productionUnits?.[0]?.id;
  const list = $("kds");
  list.textContent = "";
  if (!unitId) {
    list.append(emptyNode("No kitchen or counter yet", "Add at least one kitchen or counter in Setup before using the kitchen screen."));
    return;
  }
  $("kdsUnit").value = unitId;
  const rows = await api(`/kds/${unitId}`);
  if (rows.length === 0) return list.append(emptyNode("No kitchen tickets", "New orders for this kitchen or counter will appear here."));
  for (const kot of rows) {
    const node = document.createElement("div");
    node.className = "kot";
    node.innerHTML = `
      <div class="kot-title">
        <div><strong>#${kot.sequence} ${kot.table_name}</strong><br /><small>Kitchen ticket · ${kot.status}</small></div>
        <span class="badge">${kot.captain_id}</span>
      </div>
      <ul class="kot-items">
        ${(kot.items ?? [])
          .map(
            (item) => `<li>${item.quantity_delta} x ${escapeHtml(item.name_snapshot)}</li>`
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
    reprint.textContent = "Reprint";
    reprint.addEventListener("click", async () => {
      await api(`/kot/${kot.id}/reprint`, {
        method: "POST",
        body: JSON.stringify({ reason: "KDS reprint", requestedBy: "captain-1" })
      });
      await loadBootstrap();
    });
    actions.append(reprint);
    node.append(actions);
    list.append(node);
  }
}

function emptyNode(title = "Nothing here yet", text = "") {
  const node = $("emptyState").content.firstElementChild.cloneNode(true);
  node.innerHTML = `<strong>${escapeHtml(title)}</strong>${text ? `<span>${escapeHtml(text)}</span>` : ""}`;
  return node;
}

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
          quantity: item.quantity
        }))
      })
    });
    state.draft.clear();
    await loadBootstrap();
    await selectTable(state.selectedTableId);
  }, "Kitchen ticket sent");
});

$("generateBill").addEventListener("click", async () => {
  const orderId = state.selectedOrder?.order?.id;
  if (!orderId) return;
  await runAction(async () => {
    await api(`/bills/${orderId}/generate`, { method: "POST" });
    await loadBootstrap();
    await selectTable(state.selectedTableId);
  }, "Bill generated");
});

$("reprintBill").addEventListener("click", async () => {
  const bill = state.selectedOrder?.bill;
  if (!bill) return;
  await runAction(async () => {
    await api(`/bills/${bill.id}/reprint`, {
      method: "POST",
      body: JSON.stringify({ reason: "Captain reprint", requestedBy: "captain-1" })
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
        discountType: $("discountType").value,
        discountValue: $("discountType").value === "percent" ? Number($("billDiscount").value || 0) : Number($("billDiscount").value || 0) * 100,
        tipPaise: Number($("billTip").value || 0) * 100,
        payments,
        receivedBy: "captain-1"
      })
    });
    await loadBootstrap();
    if (state.selectedTableId) await selectTable(state.selectedTableId);
    renderOrder();
  }, "Bill punched");
});

$("cancelOrder").addEventListener("click", async () => {
  const orderId = state.selectedOrder?.order?.id;
  if (!orderId) return;
  await runAction(async () => {
    await api(`/orders/${orderId}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Cancelled from captain" }) });
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
for (const id of ["billDiscount", "billTip", "discountType"]) {
  $(id)?.addEventListener("input", () => {
    $(id).dataset.touched = "1";
    renderPaymentPanel();
  });
}
for (const button of document.querySelectorAll(".quick-pay-btn")) {
  button.addEventListener("click", () => fillFullPayment(button.dataset.method));
}
$("deviceToken").addEventListener("change", () => {
  localStorage.setItem("deviceToken", $("deviceToken").value);
  if ($("setupDeviceToken")) $("setupDeviceToken").value = $("deviceToken").value;
  void loadBootstrap();
});
$("saveHubToken").addEventListener("click", async () => {
  const token = $("setupDeviceToken").value.trim();
  $("deviceToken").value = token;
  localStorage.setItem("deviceToken", token);
  await loadBootstrap();
  if (state.bootstrap) {
    focusNextSetupStep();
    showToast("Hub unlocked. Setup can continue.");
  }
});
$("toggleHubToken").addEventListener("click", () => {
  const input = $("setupDeviceToken");
  const nextType = input.type === "password" ? "text" : "password";
  input.type = nextType;
  $("toggleHubToken").textContent = nextType === "password" ? "Show" : "Hide";
});
$("goService").addEventListener("click", () => switchView("serviceView"));
for (const button of document.querySelectorAll(".setup-edit")) {
  button.addEventListener("click", () => setActiveSetupStep(button.dataset.goStep));
}
$("kdsUnit").addEventListener("change", loadKds);
$("processPrints").addEventListener("click", async () => {
  await runAction(async () => {
    await api("/print-jobs/process", { method: "POST" });
    await loadBootstrap();
  }, "Print queue processed");
});
$("loadPrinters").addEventListener("click", loadSystemPrinters);
$("skipPrinter").addEventListener("click", () => {
  state.printerSkipped = true;
  localStorage.setItem("printerSetupSkipped", "1");
  focusNextSetupStep();
  showToast("Dry-run printing is enabled. Add the real printer before live restaurant use.");
});
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
    state.printerSkipped = false;
    localStorage.removeItem("printerSetupSkipped");
    await loadBootstrap();
    focusNextSetupStep();
  }, "Cash counter printer saved");
});
$("floorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    await api("/floors", {
      method: "POST",
      body: JSON.stringify({ name: $("floorName").value, customId: $("floorCustomId").value || undefined })
    });
    $("floorName").value = "";
    $("floorCustomId").value = "";
    await loadBootstrap();
    keepSetupStep("tables");
  }, "Floor added");
});
$("tableForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    await api("/tables", {
      method: "POST",
      body: JSON.stringify({ floorId: $("tableFloor").value, name: $("tableName").value, customId: $("tableCustomId").value || undefined })
    });
    $("tableName").value = "";
    $("tableCustomId").value = "";
    await loadBootstrap();
    keepSetupStep("tables");
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
        kdsEnabled: true,
        customId: $("unitCustomId").value || undefined
      })
    });
    $("unitName").value = "";
    $("unitCustomId").value = "";
    $("unitHost").value = "";
    $("unitPort").value = "9100";
    await loadBootstrap();
    keepSetupStep("kitchens");
  }, "Kitchen / counter added");
});
$("menuItemForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    await api("/menu-items", {
      method: "POST",
      body: JSON.stringify({
        name: $("menuItemName").value,
        pricePaise: Number($("menuItemPrice").value || 0) * 100,
        productionUnitId: $("menuItemUnit").value || null,
        active: true,
        customId: $("menuItemCustomId").value || undefined
      })
    });
    $("menuItemName").value = "";
    $("menuItemPrice").value = "";
    $("menuItemUnit").value = "";
    $("menuItemCustomId").value = "";
    await loadBootstrap();
    keepSetupStep("menu");
  }, "Dish added");
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
    const pairingResult = $("pairingResult");
    pairingResult.replaceChildren();
    const card = document.createElement("div");
    card.className = "pairing-card";
    const qr = document.createElement("img");
    qr.src = result.qrDataUrl;
    qr.alt = "Device pairing QR code";
    const detail = document.createElement("div");
    const code = document.createElement("strong");
    code.textContent = `Code ${result.code}`;
    const help = document.createElement("span");
    help.textContent = `Scan QR or enter code manually. Expires ${new Date(result.expiresAt).toLocaleTimeString()}.`;
    const payload = document.createElement("textarea");
    payload.readOnly = true;
    payload.value = result.pairingPayloadText;
    detail.append(code, help, payload);
    card.append(qr, detail);
    pairingResult.append(card);
    await loadAdminPanels();
    focusNextSetupStep();
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
    showToast(result.skipped ? "Could not get cloud updates. Check hub connection settings." : `Applied ${result.applied} cloud updates.`);
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
    switchView(item.dataset.view);
  });
}
