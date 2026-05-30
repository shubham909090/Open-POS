import type {
  AlcoholCatalog,
  AlcoholStockMovement,
  AppUpdateStatus,
  BackupSummary,
  BillAdjustmentPayload,
  BillPrinterSlot,
  BillPrinters,
  Bootstrap,
  BulkDeleteResult,
  CachedUpdatePackage,
  CloseSummary,
  CsvImportResult,
  DailyReportDetail,
  DailyReportRow,
  GithubUpdateCheckResult,
  GithubUpdateInstallRequest,
  HubConnectionSettings,
  KdsTicket,
  LocalDevice,
  ManagerApprovalPayload,
  MasterApprovalPayload,
  OnlineUpdateInstallResult,
  PairingCodeResult,
  PrintLayoutSettings,
  PrintLayouts,
  PrintProcessSummary,
  RangeReportDetail,
  Role,
  SystemPrinterInfo,
  TableOrder,
  ValidatedUpdatePackage,
} from "./hub-api-types.js";

export type * from "./hub-api-types.js";

let authToken = localStorage.getItem("deviceToken") || "dev-admin-token";

declare global {
  interface Window {
    gauravPos?: {
      chooseUpdatePackage?: (kind?: "update" | "installer") => Promise<string | null>;
      repairFocus?: () => Promise<{ ok: true }>;
    };
  }
}

export function getAuthToken() {
  return authToken;
}

export function setAuthToken(token: string) {
  authToken = token.trim();
  localStorage.setItem("deviceToken", authToken);
}

export function clearAuthToken() {
  authToken = "";
  localStorage.removeItem("deviceToken");
}

function idempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export async function apiFetch<T>(path: string, options: RequestInit & { idempotent?: string; idempotencyKey?: string } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${authToken}`);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
  else if (options.idempotent) headers.set("idempotency-key", idempotencyKey(options.idempotent));

  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Request failed: ${response.status}`);
  }
  return body as T;
}

export const hubApi = {
  adminSessionStatus: () => apiFetch<{ managerPinConfigured: boolean }>("/admin/session/status"),
  unlockAdminSession: (pin: string) => apiFetch<{ token: string; role: "admin" }>("/admin/session/unlock", { method: "POST", body: JSON.stringify({ pin }) }),
  lockAdminSession: () => apiFetch<{ locked: boolean }>("/admin/session/lock", { method: "POST", body: JSON.stringify({}) }),
  bootstrap: () => apiFetch<Bootstrap>("/sync/bootstrap"),
  tableOrder: (tableId: string) => apiFetch<TableOrder | null>(`/tables/${tableId}/order`),
  currentBusinessDaySummary: () => apiFetch<CloseSummary>("/business-day/current-summary"),
  dailyReports: () => apiFetch<DailyReportRow[]>("/reports/daily"),
  dailyReport: (posDayId: string) => apiFetch<DailyReportDetail>(`/reports/daily/${posDayId}`),
  rangeReport: (from: string, to: string, includeBills = false) =>
    apiFetch<RangeReportDetail>(`/reports/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&includeBills=${includeBills ? "true" : "false"}`),
  backups: () => apiFetch<BackupSummary[]>("/backups"),
  createBackup: (label: string) => apiFetch<BackupSummary>("/backups", { method: "POST", body: JSON.stringify({ label }) }),
  scheduleRestore: (fileName: string) =>
    apiFetch<{ scheduled: true; restartRequired: true; backup: BackupSummary }>("/backups/restore", { method: "POST", body: JSON.stringify({ fileName }) }),
  updateStatus: () => apiFetch<AppUpdateStatus>("/system/update/status"),
  installOnlineUpdate: () => apiFetch<OnlineUpdateInstallResult>("/system/update/online/install", { method: "POST", body: JSON.stringify({}) }),
  githubUpdateLatest: () => apiFetch<GithubUpdateCheckResult>("/system/update/github/latest"),
  validateUpdatePackage: (packagePath: string) =>
    apiFetch<ValidatedUpdatePackage>("/system/update/validate", { method: "POST", body: JSON.stringify({ packagePath }) }),
  registerUpdateBaseline: (packagePath: string) =>
    apiFetch<CachedUpdatePackage>("/system/update/register-baseline", { method: "POST", body: JSON.stringify({ packagePath }) }),
  registerInstallerBaseline: (installerPath: string) =>
    apiFetch<CachedUpdatePackage>("/system/update/register-installer-baseline", { method: "POST", body: JSON.stringify({ installerPath }) }),
  installUpdate: (packagePath: string, managerPin: string) =>
    apiFetch<{ installing: true; backup: BackupSummary; package: CachedUpdatePackage; recoveryScriptPath: string }>("/system/update/install", {
      method: "POST",
      headers: { "x-manager-pin": managerPin },
      body: JSON.stringify({ packagePath })
    }),
  installGithubUpdate: (request: GithubUpdateInstallRequest, managerPin: string) =>
    apiFetch<{ installing: true; backup: BackupSummary; package: CachedUpdatePackage; recoveryScriptPath: string }>("/system/update/github/install", {
      method: "POST",
      headers: { "x-manager-pin": managerPin },
      body: JSON.stringify(request)
    }),
  rollbackUpdate: (managerPin: string) =>
    apiFetch<{ rollingBack: true; package: CachedUpdatePackage }>("/system/update/rollback", {
      method: "POST",
      headers: { "x-manager-pin": managerPin },
      body: JSON.stringify({})
    }),
  alcoholStockMovements: () => apiFetch<AlcoholStockMovement[]>("/reports/alcohol-stock-movements?limit=100"),
  kds: (unitId: string) => apiFetch<KdsTicket[]>(`/kds/${unitId}`),
  devices: () => apiFetch<LocalDevice[]>("/devices"),
  createPairingCode: (payload: { deviceName: string; role: Role; expiresInMinutes: number; managerApproval?: { pin: string; reason: string; approvedBy: string } }) =>
    apiFetch<PairingCodeResult>("/devices/pairing-codes", { method: "POST", body: JSON.stringify(payload) }),
  revokeDevice: (id: string) =>
    apiFetch<{ id: string }>(`/devices/${id}/revoke`, { method: "POST", body: JSON.stringify({ reason: "Revoked from hub setup" }) }),
  createFloor: (name: string) => apiFetch<{ id: string }>("/floors", { method: "POST", body: JSON.stringify({ name }) }),
  updateFloor: (id: string, payload: { name?: string; active?: boolean; sortOrder?: number }) =>
    apiFetch<{ id: string }>(`/floors/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteFloor: (id: string) => apiFetch<{ id: string; deleted: boolean }>(`/floors/${id}`, { method: "DELETE" }),
  createTable: (floorId: string, name: string) =>
    apiFetch<{ id: string }>("/tables", { method: "POST", body: JSON.stringify({ floorId, name, active: true }) }),
  updateTable: (id: string, payload: { name?: string; active?: boolean; floorId?: string; sortOrder?: number }) =>
    apiFetch<{ id: string }>(`/tables/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteTable: (id: string) => apiFetch<{ id: string; deleted: boolean }>(`/tables/${id}`, { method: "DELETE" }),
  createUnit: (name: string) =>
    apiFetch<{ id: string }>("/production-units", {
      method: "POST",
      body: JSON.stringify({ name, printerMode: "system", printerName: "", printerPort: 9100, kdsEnabled: true, active: true })
    }),
  updateUnit: (
    id: string,
    payload: {
      name?: string;
      active?: boolean;
      printerMode?: "system" | "network";
      printerName?: string | null;
      printerHost?: string;
      printerPort?: number;
      kdsEnabled?: boolean;
    }
  ) =>
    apiFetch<{ id: string }>(`/production-units/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteUnit: (id: string) => apiFetch<{ id: string; deleted: boolean }>(`/production-units/${id}`, { method: "DELETE" }),
  createDish: (payload: { name: string; pricePaise: number; productionUnitId: string | null; saleGroupId?: string; active: boolean }) =>
    apiFetch<{ id: string }>("/menu-items", { method: "POST", body: JSON.stringify(payload) }),
  importDishesCsv: (csv: string) =>
    apiFetch<CsvImportResult>("/menu-items/import-csv", { method: "POST", body: JSON.stringify({ csv }) }),
  updateDish: (id: string, payload: { name?: string; pricePaise?: number; productionUnitId?: string | null; saleGroupId?: string; active?: boolean }) =>
    apiFetch<{ id: string }>(`/menu-items/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteDish: (id: string, managerApproval: ManagerApprovalPayload["managerApproval"]) =>
    apiFetch<{ id: string; deleted: boolean }>(`/menu-items/${id}`, { method: "DELETE", body: JSON.stringify({ managerApproval }) }),
  bulkDeleteDishes: (managerApproval: ManagerApprovalPayload["managerApproval"]) =>
    apiFetch<BulkDeleteResult>("/menu-items/bulk-delete", { method: "POST", body: JSON.stringify({ managerApproval }) }),
  setManagerPin: (payload: { currentPin?: string; newPin: string; updatedBy: string }) =>
    apiFetch<{ configured: boolean }>("/settings/manager-pin", { method: "PUT", body: JSON.stringify(payload) }),
  masterPinStatus: () => apiFetch<{ masterPinConfigured: boolean }>("/settings/master-pin/status"),
  setMasterPin: (payload: { currentPin?: string; newPin: string; confirmPin: string; updatedBy: string }) =>
    apiFetch<{ configured: boolean }>("/settings/master-pin", { method: "PUT", body: JSON.stringify(payload) }),
  hubConnection: (managerPin?: string) =>
    apiFetch<HubConnectionSettings>(`/settings/hub-connection${managerPin ? "?reveal=1" : ""}`, {
      headers: managerPin ? { "x-manager-pin": managerPin } : undefined
    }),
  updateHubConnection: (payload: Omit<HubConnectionSettings, "configured">, managerPin: string) =>
    apiFetch<{ configured: boolean }>("/settings/hub-connection", {
      method: "PUT",
      headers: { "x-manager-pin": managerPin },
      body: JSON.stringify(payload)
    }),
  testHubConnection: (managerPin: string) =>
    apiFetch<{ status: "missing" | "connected" | "unauthorized" | "server_error"; message: string }>("/settings/hub-connection/test", {
      method: "POST",
      headers: { "x-manager-pin": managerPin },
      body: JSON.stringify({})
    }),
  licenseStatus: () => apiFetch<NonNullable<Bootstrap["setup"]>["license"]>("/license/status"),
  activateLicense: (payload: { cloudUrl: string; setupKey: string; hubLabel?: string }) =>
    apiFetch<NonNullable<Bootstrap["setup"]>["license"]>("/license/activate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  checkLicense: () => apiFetch<NonNullable<Bootstrap["setup"]>["license"]>("/license/check", { method: "POST", body: JSON.stringify({}) }),
  cloudBackupManifest: () => apiFetch<unknown>("/cloud-backup/manifest"),
  restoreCloudBackup: (
    payload: { kind: "order_history" | "menu_catalog" | "alcohol_stock" | "table_layout"; throughBusinessDate?: string },
    masterPin: string
  ) =>
    apiFetch<{ restored: true; imported: number; kind: typeof payload.kind }>("/cloud-backup/restore", {
      method: "POST",
      headers: { "x-master-pin": masterPin },
      body: JSON.stringify(payload)
    }),
  updateTicketTemplate: (payload: { billHeader?: string; billFooter?: string; kotHeader?: string; kotFooter?: string; restaurantName?: string; restaurantAddress?: string; taxRegistrationText?: string; lineWidthChars?: number }) =>
    apiFetch("/settings/ticket-template", { method: "PUT", body: JSON.stringify(payload) }),
  printLayouts: () => apiFetch<PrintLayouts>("/print-layouts"),
  updatePrintLayout: (scope: "default" | "receipt" | "unit", payload: PrintLayoutSettings, managerPin: string) =>
    apiFetch<PrintLayoutSettings>(`/print-layouts/${scope}`, {
      method: "PUT",
      headers: { "x-manager-pin": managerPin },
      body: JSON.stringify(payload)
    }),
  fullReset: (payload: ManagerApprovalPayload & { confirmationText: string; includeBackups: boolean }) =>
    apiFetch<{ scheduled: true; restartRequired: true; includeBackups: boolean }>("/system/full-reset", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateSaleGroup: (id: string, payload: { defaultProductionUnitId?: string | null; taxComponents?: Array<{ name: string; rateBps: number }>; ticketLabel?: "KOT" | "BOT"; active?: boolean }) =>
    apiFetch<{ id: string }>(`/sale-groups/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  systemPrinters: (options: { refresh?: boolean } = {}) => apiFetch<SystemPrinterInfo[]>(`/system-printers${options.refresh ? "?refresh=1" : ""}`),
  billPrinters: () => apiFetch<BillPrinters>("/settings/bill-printers"),
  updateBillPrinters: (payload: { default: { label: string; printerMode: "system" | "network"; printerName?: string; printerHost?: string; printerPort: number }; alternate: { label: string; printerMode: "system" | "network"; printerName?: string; printerHost?: string; printerPort: number } }) =>
    apiFetch<BillPrinters>("/settings/bill-printers", { method: "PUT", body: JSON.stringify(payload) }),
  receiptPrinter: () => apiFetch<{ printerMode?: "system" | "network"; printerHost: string | null; printerPort: number | null; printerName: string | null }>("/settings/receipt-printer"),
  updateReceiptPrinter: (payload: { printerMode: "system" | "network"; printerName?: string; printerHost?: string; printerPort: number }) =>
    apiFetch("/settings/receipt-printer", { method: "PUT", body: JSON.stringify(payload) }),
  updatePrinterMode: (mode: "test" | "live") =>
    apiFetch<{ mode: "test" | "live" }>("/settings/printer-mode", { method: "PUT", body: JSON.stringify({ mode }) }),
  submitOrder: (
    payload: {
      tableId: string;
      pax: number;
      printMode?: "kot" | "kot_print";
      note?: string;
      items: Array<
        | { menuItemId: string; quantity: number; note?: string }
        | { menuItemId: string; menuItemVariantId: string; quantity: number; note?: string }
        | { openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number; note?: string }
      >;
    },
    idempotencyKey?: string
  ) =>
    apiFetch<{ orderId: string; kotIds: string[]; printJobIds?: string[]; processed?: PrintProcessSummary }>("/orders/submit", {
      method: "POST",
      idempotent: "orders-submit",
      idempotencyKey,
      body: JSON.stringify({ ...payload, orderType: "dine_in" })
    }),
  updateOrderState: (
    orderId: string,
    payload: {
      saveMode: "save" | "save_print";
      items: Array<
        | { orderItemId?: string; menuItemId: string; menuItemVariantId?: string; quantity: number; note?: string }
        | { orderItemId?: string; openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number; note?: string }
      >;
      managerApproval?: { pin: string; reason: string; approvedBy: string };
    },
    idempotencyKey?: string
  ) =>
    apiFetch<{ orderId: string; status: string; totalPaise: number; kotIds: string[]; printJobIds?: string[]; processed?: PrintProcessSummary }>(`/orders/${orderId}/state`, {
      method: "POST",
      idempotent: "order-state",
      idempotencyKey,
      body: JSON.stringify(payload)
    }),
  generateBill: (orderId: string, idempotencyKey?: string, printerSlot: BillPrinterSlot = "default", adjustments: BillAdjustmentPayload = {}) =>
    apiFetch<{ billId: string; billNumber: number; totalPaise: number; finalTotalPaise: number; printJobId: string; processed?: PrintProcessSummary }>(`/bills/${orderId}/generate`, {
        method: "POST",
        idempotent: "bill-generate",
        idempotencyKey,
        body: JSON.stringify({ printerSlot, ...adjustments })
      }),
  settleBill: (
    billId: string,
    payload: {
      discountType: "amount" | "percent";
      discountValue: number;
      tipPaise: number;
      payments: Array<{ method: "cash" | "upi" | "card" | "online"; amountPaise: number; reference?: string }>;
    },
    idempotencyKey?: string,
  ) =>
    apiFetch<{ billId: string; status: string; remainingPaise: number }>(`/bills/${billId}/settle`, {
      method: "POST",
      idempotent: "bill-settle",
      idempotencyKey,
      body: JSON.stringify(payload)
    }),
  printBill: (billId: string, idempotencyKey?: string, printerSlot: BillPrinterSlot = "default") =>
    apiFetch<{ printJobId: string; processed?: PrintProcessSummary }>(`/bills/${billId}/print`, { method: "POST", idempotent: "bill-print", idempotencyKey, body: JSON.stringify({ printerSlot }) }),
  reviseBill: (
    billId: string,
    payload: ManagerApprovalPayload & {
      items: Array<
        | { orderItemId?: string; menuItemId: string; menuItemVariantId?: string; quantity: number }
        | { orderItemId?: string; openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number }
      >;
    },
    idempotencyKey?: string
  ) =>
    apiFetch<{ billId: string; revisionNumber: number; totalPaise: number; kotIds: string[]; printJobIds?: string[]; processed?: PrintProcessSummary }>(`/bills/${billId}/revise`, {
      method: "POST",
      idempotent: "bill-revise",
      idempotencyKey,
      body: JSON.stringify(payload)
    }),
  reprintBill: (billId: string, payload: ManagerApprovalPayload & BillAdjustmentPayload, idempotencyKey?: string, printerSlot: BillPrinterSlot = "default") =>
    apiFetch<{ printJobId: string; processed?: PrintProcessSummary }>(`/bills/${billId}/reprint`, { method: "POST", idempotent: "bill-reprint", idempotencyKey, body: JSON.stringify({ reason: payload.managerApproval.reason, ...payload, printerSlot }) }),
  historyReprintBill: (billId: string, idempotencyKey?: string, printerSlot: BillPrinterSlot = "default") =>
    apiFetch<{ printJobId: string; processed?: PrintProcessSummary }>(`/bills/${billId}/history-reprint`, { method: "POST", idempotent: "bill-history-reprint", idempotencyKey, body: JSON.stringify({ printerSlot }) }),
  historyEditBill: (
    billId: string,
    payload: MasterApprovalPayload & BillAdjustmentPayload & {
      items: Array<
        | { orderItemId?: string; menuItemId: string; menuItemVariantId?: string; quantity: number }
        | { orderItemId?: string; openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number }
      >;
      payments?: Array<{ method: "cash" | "upi" | "card" | "online"; amountPaise: number; reference?: string }>;
    },
    idempotencyKey?: string,
    printerSlot: BillPrinterSlot = "default"
  ) =>
    apiFetch<{ billId: string; revisionNumber: number; totalPaise: number; printJobId: string; processed?: PrintProcessSummary; modified: boolean }>(`/bills/${billId}/history-edit`, {
      method: "POST",
      idempotent: "bill-history-edit",
      idempotencyKey,
      body: JSON.stringify({ ...payload, printerSlot })
    }),
  markBillNc: (billId: string, payload: ManagerApprovalPayload & BillAdjustmentPayload, idempotencyKey?: string, printerSlot: BillPrinterSlot = "default") =>
    apiFetch<{ printJobId: string; processed?: PrintProcessSummary }>(`/bills/${billId}/nc`, { method: "POST", idempotent: "bill-nc", idempotencyKey, body: JSON.stringify({ ...payload, printerSlot }) }),
  cancelOrder: (orderId: string, payload: ManagerApprovalPayload) =>
    apiFetch<{ orderId: string; kotIds?: string[]; printJobIds?: string[]; processed?: PrintProcessSummary }>(`/orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: payload.managerApproval.reason, ...payload })
    }),
  cancelItems: (orderId: string, payload: ManagerApprovalPayload & { items: Array<{ orderItemId: string; quantity: number }> }) =>
    apiFetch<{ orderId: string; kotIds: string[]; printJobIds?: string[]; processed?: PrintProcessSummary }>(`/orders/${orderId}/items/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: payload.managerApproval.reason, ...payload })
    }),
  moveTable: (payload: { fromTableId: string; toTableId: string; reason: string }) =>
    apiFetch<{ orderId: string; kotIds: string[]; printJobIds?: string[]; processed?: PrintProcessSummary }>("/tables/move", { method: "POST", body: JSON.stringify(payload) }),
  moveItems: (payload: { fromTableId: string; toTableId: string; reason: string; items: Array<{ orderItemId: string; quantity: number }> }) =>
    apiFetch<{ fromOrderId: string; toOrderId: string; sourceKotIds: string[]; targetKotIds: string[]; printJobIds?: string[]; processed?: PrintProcessSummary }>("/orders/items/move", { method: "POST", body: JSON.stringify(payload) }),
  alcohol: () => apiFetch<AlcoholCatalog>("/alcohol"),
  importAlcoholCsv: (type: "plain_liquor" | "prepared_product", csv: string) =>
    apiFetch<CsvImportResult>("/alcohol/items/import-csv", { method: "POST", body: JSON.stringify({ type, csv }) }),
  createAlcoholItem: (payload: unknown) => apiFetch<{ id: string }>("/alcohol/items", { method: "POST", body: JSON.stringify(payload) }),
  updateAlcoholItem: (id: string, payload: unknown) => apiFetch<{ id: string }>(`/alcohol/items/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteAlcoholItem: (id: string, masterApproval: MasterApprovalPayload["masterApproval"]) =>
    apiFetch<{ id: string; deleted: boolean; active: boolean }>(`/menu-items/${id}`, { method: "DELETE", body: JSON.stringify({ masterApproval }) }),
  bulkDeleteAlcoholItems: (masterApproval: MasterApprovalPayload["masterApproval"]) =>
    apiFetch<BulkDeleteResult>("/alcohol/items/bulk-delete", { method: "POST", body: JSON.stringify({ masterApproval }) }),
  adjustAlcoholStock: (id: string, payload: unknown) => apiFetch<{ id: string }>(`/alcohol/stock/${id}/adjust`, { method: "POST", body: JSON.stringify(payload) }),
  updateKotStatus: (kotId: string, status: string) =>
    apiFetch<{ id: string }>(`/kot/${kotId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  processPrints: () => apiFetch<{ printed: number; failed: number }>("/print-jobs/process", { method: "POST" }),
  testBillPrint: (printerSlot: BillPrinterSlot = "default") =>
    apiFetch<{ printJobId: string; processed: { printed: number; failed: number; error?: string } }>("/print-jobs/test-bill", {
      method: "POST",
      body: JSON.stringify({ printerSlot })
    }),
  testKotPrint: () => apiFetch<{ printJobId: string; processed: { printed: number; failed: number } }>("/print-jobs/test-kot", { method: "POST" }),
  pullCloud: () => apiFetch<{ applied: number; failed?: number }>("/sync/pull", { method: "POST" }),
  requeueFailedSync: () => apiFetch<{ requeued: number }>("/sync/requeue-failed", { method: "POST" }),
  resolveCloudCommandFailure: (commandId: string) =>
    apiFetch<{ commandId: string; resolved: boolean }>(`/sync/cloud-command-failures/${encodeURIComponent(commandId)}`, { method: "DELETE" })
};
