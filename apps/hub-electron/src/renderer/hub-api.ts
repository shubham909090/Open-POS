export type Role = "admin" | "captain" | "waiter" | "kitchen";

export interface PosDay {
  id: string;
  business_date: string;
  period_start_at: string;
  period_end_at: string;
  status: string;
}

export interface Floor {
  id: string;
  name: string;
  active: boolean;
}

export interface Table {
  id: string;
  floor_id: string;
  floor_name: string;
  name: string;
  active: boolean;
  status: "free" | "occupied" | "billed" | string;
  current_order_id: string | null;
  occupied_at: string | null;
}

export interface ProductionUnit {
  id: string;
  name: string;
  printer_mode?: "system" | "network";
  printer_name?: string | null;
  printer_host?: string;
  printer_port?: number;
  kds_enabled?: boolean | number;
  active: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  price_paise: number;
  production_unit_id: string | null;
  production_unit_name: string | null;
  sale_group_id: string;
  sale_group_name: string;
  sale_group_kind: string;
  ticket_label: "KOT" | "BOT";
  active: boolean;
  variants?: MenuItemVariant[];
}

export interface MenuItemVariant {
  id: string;
  menu_item_id: string;
  label: string;
  kind: "default" | "shot" | "small_bottle" | "large_bottle" | string;
  price_paise: number;
  volume_ml: number | null;
  inventory_action: "none" | "large_ml" | "small_bottle" | "large_bottle" | string;
  sort_order: number;
  active: boolean | number;
}

export interface SaleGroup {
  id: string;
  name: string;
  kind: "food" | "alcohol" | "beverage" | "other";
  report_label: string;
  ticket_label: "KOT" | "BOT";
  tax_components_json: string;
  default_production_unit_id: string | null;
  default_production_unit_name?: string | null;
  active: boolean;
}

export interface PrintJob {
  id: string;
  target_type: string;
  target_id: string;
  printer_name?: string | null;
  status: string;
  attempts: number;
  last_error?: string | null;
  created_at: string;
}

export interface SystemPrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  status?: string;
}

export interface Bootstrap {
  currentBusinessDay: PosDay;
  floors: Floor[];
  tables: Table[];
  productionUnits: ProductionUnit[];
  saleGroups: SaleGroup[];
  menuItems: MenuItem[];
  menuPopularity?: Array<{ menuItemId: string; quantity: number }>;
  ticketTemplate?: { billHeader: string; billFooter: string; kotHeader: string; kotFooter: string; restaurantName: string; taxRegistrationText: string; lineWidthChars: number };
  printLayouts?: PrintLayouts;
  printJobs: PrintJob[];
  syncStatus: {
    counts?: Record<string, number>;
    lastEvent?: unknown;
    commandFailures?: Array<{ commandId: string; type: string; error: string; failedAt: string }>;
  };
  setup?: {
    printerOutputMode: "test" | "live";
    managerPinConfigured?: boolean;
    hubConnection?: HubConnectionSettings;
  };
}

export interface HubConnectionSettings {
  configured: boolean;
  cloudUrl: string;
  installationId: string;
  syncSecret: string;
  hubPublicUrl: string;
}

export interface PrintLayoutSettings {
  scope: "default" | "receipt" | "unit";
  productionUnitId?: string;
  restaurantName: string;
  taxRegistrationText: string;
  billHeader: string;
  billFooter: string;
  kotHeader: string;
  kotFooter: string;
  lineWidthChars: number;
  headerAlign: "left" | "center";
  footerAlign: "left" | "center";
  feedLines: number;
  showTable: boolean;
  showCaptain: boolean;
  showDateTime: boolean;
  showBillId: boolean;
  showTaxBreakup: boolean;
  showPaymentSplit: boolean;
  showDiscountTip: boolean;
  showNcReprintRevision: boolean;
}

export interface PrintLayouts {
  default: PrintLayoutSettings;
  receipt: PrintLayoutSettings;
  units: Array<{ productionUnitId: string; name: string; layout: PrintLayoutSettings }>;
}

export interface ManagerApprovalPayload {
  managerApproval: { pin: string; reason: string; approvedBy: string };
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  menu_item_variant_id?: string | null;
  name_snapshot: string;
  variant_name_snapshot?: string;
  variant_volume_ml?: number | null;
  inventory_action_snapshot?: string;
  unit_price_paise: number;
  quantity: number;
  production_unit_id: string | null;
  production_unit_name?: string | null;
  sale_group_id: string;
  sale_group_name_snapshot: string;
  sale_group_kind_snapshot: string;
  ticket_label_snapshot: "KOT" | "BOT";
  is_open_item?: boolean | number;
  status: string;
}

export interface AlcoholCatalog {
  items: Array<MenuItem & {
    type: "plain_liquor" | "prepared_product";
    large_bottle_ml: number;
    small_bottle_ml: number;
    sealed_large_count: number;
    open_large_ml: number;
    sealed_small_count: number;
    recipeIngredients: Array<{ liquor_menu_item_id: string; liquor_name: string; ml_per_unit: number }>;
  }>;
  storage: AlcoholStorageRow[];
}

export interface AlcoholStorageRow {
  id: string;
  name: string;
  active: boolean | number;
  large_bottle_ml: number;
  small_bottle_ml: number;
  sealed_large_count: number;
  open_large_ml: number;
  sealed_small_count: number;
  total_available_ml: number;
  pending_large_ml: number;
  pending_large_bottles: number;
  pending_small_bottles: number;
  pending_total_ml: number;
  expected_after_settlement_ml: number;
}

export interface AlcoholStockMovement {
  id: string;
  menu_item_id: string;
  item_name: string;
  source_type: string;
  source_id: string;
  delta_sealed_large: number;
  delta_open_large_ml: number;
  delta_sealed_small: number;
  balance_sealed_large: number;
  balance_open_large_ml: number;
  balance_sealed_small: number;
  approved_by: string | null;
  created_at: string;
}

export interface Bill {
  id: string;
  order_id: string;
  status: "pending" | "paid" | string;
  total_paise: number;
  discount_paise: number;
  tip_paise: number;
  final_total_paise: number;
  revision_number?: number;
  is_nc?: boolean;
  nc_reason?: string | null;
  paid_paise?: number;
}

export interface Payment {
  id: string;
  bill_id: string;
  method: string;
  amount_paise: number;
  reference: string | null;
  created_at: string;
}

export interface TableOrder {
  order?: {
    id: string;
    table_id: string;
    status: string;
    pax: number;
    captain_id: string;
  } | null;
  items: OrderItem[];
  bill?: Bill | null;
  payments: Payment[];
}

export interface CloseSummary {
  businessDay: PosDay;
  openOrders: number;
  billedOrders: number;
  paidBills: number;
  unpaidBills: number;
  cancelledOrders?: number;
  billCount: number;
  grossSalesPaise: number;
  discountPaise: number;
  tipPaise: number;
  finalSalesPaise: number;
  cashPaymentsPaise: number;
  upiPaymentsPaise: number;
  cardPaymentsPaise: number;
  onlinePaymentsPaise: number;
  totalPaymentsPaise: number;
  nonCashPaymentsPaise: number;
  groupSummaries?: Array<{ name: string; kind: string; quantity: number; grossSalesPaise: number; taxPaise: number; finalSalesPaise: number; ncQuantity: number; ncGrossSalesPaise: number }>;
}

export interface DailyReportRow {
  pos_day_id: string;
  business_date: string;
  status: string;
  bill_count: number;
  gross_sales_paise: number;
  final_sales_paise: number;
  total_payments_paise: number;
  finalized_at: string;
}

export interface KdsTicket {
  id: string;
  sequence: number;
  table_name: string;
  status: string;
  captain_id: string;
  items: Array<{ name_snapshot: string; quantity_delta: number }>;
}

let authToken = localStorage.getItem("deviceToken") || "dev-admin-token";

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
  alcoholStockMovements: () => apiFetch<AlcoholStockMovement[]>("/reports/alcohol-stock-movements?limit=100"),
  kds: (unitId: string) => apiFetch<KdsTicket[]>(`/kds/${unitId}`),
  createFloor: (name: string) => apiFetch<{ id: string }>("/floors", { method: "POST", body: JSON.stringify({ name }) }),
  updateFloor: (id: string, payload: { name?: string; active?: boolean }) =>
    apiFetch<{ id: string }>(`/floors/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteFloor: (id: string) => apiFetch<{ id: string; deleted: boolean }>(`/floors/${id}`, { method: "DELETE" }),
  createTable: (floorId: string, name: string) =>
    apiFetch<{ id: string }>("/tables", { method: "POST", body: JSON.stringify({ floorId, name, active: true }) }),
  updateTable: (id: string, payload: { name?: string; active?: boolean; floorId?: string }) =>
    apiFetch<{ id: string }>(`/tables/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteTable: (id: string) => apiFetch<{ id: string; deleted: boolean }>(`/tables/${id}`, { method: "DELETE" }),
  createUnit: (name: string) =>
    apiFetch<{ id: string }>("/production-units", {
      method: "POST",
      body: JSON.stringify({ name, printerMode: "system", printerName: "", printerPort: 9100, kdsEnabled: true, active: true })
    }),
  updateUnit: (id: string, payload: { name?: string; active?: boolean }) =>
    apiFetch<{ id: string }>(`/production-units/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteUnit: (id: string) => apiFetch<{ id: string; deleted: boolean }>(`/production-units/${id}`, { method: "DELETE" }),
  createDish: (payload: { name: string; pricePaise: number; productionUnitId: string | null; saleGroupId?: string; active: boolean }) =>
    apiFetch<{ id: string }>("/menu-items", { method: "POST", body: JSON.stringify(payload) }),
  updateDish: (id: string, payload: { name?: string; pricePaise?: number; productionUnitId?: string | null; saleGroupId?: string; active?: boolean }) =>
    apiFetch<{ id: string }>(`/menu-items/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteDish: (id: string) => apiFetch<{ id: string; deleted: boolean }>(`/menu-items/${id}`, { method: "DELETE" }),
  setManagerPin: (payload: { currentPin?: string; newPin: string; updatedBy: string }) =>
    apiFetch<{ configured: boolean }>("/settings/manager-pin", { method: "PUT", body: JSON.stringify(payload) }),
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
  updateTicketTemplate: (payload: { billHeader?: string; billFooter?: string; kotHeader?: string; kotFooter?: string; restaurantName?: string; taxRegistrationText?: string; lineWidthChars?: number }) =>
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
  systemPrinters: () => apiFetch<SystemPrinterInfo[]>("/system-printers"),
  receiptPrinter: () => apiFetch<{ printerHost: string | null; printerPort: number | null; printerName: string | null }>("/settings/receipt-printer"),
  updateReceiptPrinter: (payload: { printerMode: "system" | "network"; printerName?: string; printerHost?: string; printerPort: number }) =>
    apiFetch("/settings/receipt-printer", { method: "PUT", body: JSON.stringify(payload) }),
  updatePrinterMode: (mode: "test" | "live") =>
    apiFetch<{ mode: "test" | "live" }>("/settings/printer-mode", { method: "PUT", body: JSON.stringify({ mode }) }),
  submitOrder: (
    payload: {
      tableId: string;
      pax: number;
      items: Array<
        | { menuItemId: string; quantity: number }
        | { menuItemId: string; menuItemVariantId: string; quantity: number }
        | { openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number }
      >;
    },
    idempotencyKey?: string
  ) =>
    apiFetch<{ orderId: string; kotIds: string[] }>("/orders/submit", {
      method: "POST",
      idempotent: "orders-submit",
      idempotencyKey,
      body: JSON.stringify({ ...payload, orderType: "dine_in" })
    }),
  generateBill: (orderId: string, idempotencyKey?: string) =>
    apiFetch<{ billId: string; totalPaise: number }>(`/bills/${orderId}/generate`, { method: "POST", idempotent: "bill-generate", idempotencyKey }),
  settleBill: (
    billId: string,
    payload: {
      discountType: "amount" | "percent";
      discountValue: number;
      tipPaise: number;
      payments: Array<{ method: "cash" | "upi" | "card" | "online"; amountPaise: number; reference?: string }>;
    },
    idempotencyKey?: string
  ) =>
    apiFetch<{ billId: string; status: string; remainingPaise: number }>(`/bills/${billId}/settle`, {
      method: "POST",
      idempotent: "bill-settle",
      idempotencyKey,
      body: JSON.stringify(payload)
    }),
  printBill: (billId: string, idempotencyKey?: string) =>
    apiFetch<{ printJobId: string }>(`/bills/${billId}/print`, { method: "POST", idempotent: "bill-print", idempotencyKey, body: JSON.stringify({}) }),
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
    apiFetch<{ billId: string; revisionNumber: number; totalPaise: number; kotIds: string[] }>(`/bills/${billId}/revise`, {
      method: "POST",
      idempotent: "bill-revise",
      idempotencyKey,
      body: JSON.stringify(payload)
    }),
  reprintBill: (billId: string, payload: ManagerApprovalPayload, idempotencyKey?: string) =>
    apiFetch<{ printJobId: string }>(`/bills/${billId}/reprint`, { method: "POST", idempotent: "bill-reprint", idempotencyKey, body: JSON.stringify({ reason: payload.managerApproval.reason, ...payload }) }),
  markBillNc: (billId: string, payload: ManagerApprovalPayload, idempotencyKey?: string) =>
    apiFetch<{ printJobId: string }>(`/bills/${billId}/nc`, { method: "POST", idempotent: "bill-nc", idempotencyKey, body: JSON.stringify(payload) }),
  cancelOrder: (orderId: string, payload: ManagerApprovalPayload) =>
    apiFetch<{ orderId: string }>(`/orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: payload.managerApproval.reason, ...payload })
    }),
  moveTable: (payload: { fromTableId: string; toTableId: string; reason: string }) =>
    apiFetch<{ orderId: string; kotIds: string[] }>("/tables/move", { method: "POST", body: JSON.stringify(payload) }),
  moveItems: (payload: { fromTableId: string; toTableId: string; reason: string; items: Array<{ orderItemId: string; quantity: number }> }) =>
    apiFetch<{ fromOrderId: string; toOrderId: string; sourceKotIds: string[]; targetKotIds: string[] }>("/orders/items/move", { method: "POST", body: JSON.stringify(payload) }),
  alcohol: () => apiFetch<AlcoholCatalog>("/alcohol"),
  createAlcoholItem: (payload: unknown) => apiFetch<{ id: string }>("/alcohol/items", { method: "POST", body: JSON.stringify(payload) }),
  updateAlcoholItem: (id: string, payload: unknown) => apiFetch<{ id: string }>(`/alcohol/items/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adjustAlcoholStock: (id: string, payload: unknown) => apiFetch<{ id: string }>(`/alcohol/stock/${id}/adjust`, { method: "POST", body: JSON.stringify(payload) }),
  updateKotStatus: (kotId: string, status: string) =>
    apiFetch<{ id: string }>(`/kot/${kotId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  processPrints: () => apiFetch<{ printed: number; failed: number }>("/print-jobs/process", { method: "POST" }),
  testBillPrint: () => apiFetch<{ printJobId: string; processed: { printed: number; failed: number } }>("/print-jobs/test-bill", { method: "POST" }),
  testKotPrint: () => apiFetch<{ printJobId: string; processed: { printed: number; failed: number } }>("/print-jobs/test-kot", { method: "POST" }),
  pullCloud: () => apiFetch<{ applied: number; failed?: number }>("/sync/pull", { method: "POST" }),
  requeueFailedSync: () => apiFetch<{ requeued: number }>("/sync/requeue-failed", { method: "POST" }),
  resolveCloudCommandFailure: (commandId: string) =>
    apiFetch<{ commandId: string; resolved: boolean }>(`/sync/cloud-command-failures/${encodeURIComponent(commandId)}`, { method: "DELETE" })
};
