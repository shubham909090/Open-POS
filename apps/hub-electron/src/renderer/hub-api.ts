export type Role = "admin" | "cashier" | "waiter" | "kitchen";

export interface PosDay {
  id: string;
  business_date: string;
  opening_cash_paise: number;
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
  status: "free" | "occupied" | string;
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

export interface Bootstrap {
  openDay?: PosDay | null;
  floors: Floor[];
  tables: Table[];
  productionUnits: ProductionUnit[];
  menuItems: MenuItem[];
  printJobs: PrintJob[];
  syncStatus: { counts?: Record<string, number>; lastEvent?: unknown };
  setup?: { printerDryRun: boolean };
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  name_snapshot: string;
  unit_price_paise: number;
  quantity: number;
  production_unit_id: string | null;
  production_unit_name?: string | null;
  status: string;
}

export interface Bill {
  id: string;
  order_id: string;
  status: "pending" | "paid" | string;
  total_paise: number;
  discount_paise: number;
  tip_paise: number;
  final_total_paise: number;
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
  openDay: PosDay | null;
  openOrders: number;
  billedOrders: number;
  paidBills: number;
  unpaidBills: number;
  cancelledOrders?: number;
  openingCashPaise: number;
  closingCashPaise?: number | null;
  cashVariancePaise?: number | null;
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
  expectedClosingCashPaise: number;
}

export interface DailyReportRow {
  pos_day_id: string;
  business_date: string;
  status: string;
  bill_count: number;
  gross_sales_paise: number;
  final_sales_paise: number;
  total_payments_paise: number;
  cash_variance_paise: number;
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

function idempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export async function apiFetch<T>(path: string, options: RequestInit & { idempotent?: string } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${authToken}`);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (options.idempotent) headers.set("idempotency-key", idempotencyKey(options.idempotent));

  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Request failed: ${response.status}`);
  }
  return body as T;
}

export const hubApi = {
  bootstrap: () => apiFetch<Bootstrap>("/sync/bootstrap"),
  tableOrder: (tableId: string) => apiFetch<TableOrder | null>(`/tables/${tableId}/order`),
  closeSummary: () => apiFetch<CloseSummary>("/pos-days/close-summary"),
  dailyReports: () => apiFetch<DailyReportRow[]>("/reports/daily"),
  kds: (unitId: string) => apiFetch<KdsTicket[]>(`/kds/${unitId}`),
  openDay: (openingCashPaise: number) =>
    apiFetch<{ id: string }>("/pos-days/open", {
      method: "POST",
      body: JSON.stringify({
        outletId: "outlet-main",
        businessDate: new Date().toISOString().slice(0, 10),
        openingCashPaise,
        openedBy: "cashier"
      })
    }),
  closeDay: (closingCashPaise: number) =>
    apiFetch<{ id: string; report: CloseSummary }>("/pos-days/close", {
      method: "POST",
      body: JSON.stringify({ closingCashPaise, closedBy: "cashier" })
    }),
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
  createDish: (payload: { name: string; pricePaise: number; productionUnitId: string | null; active: boolean }) =>
    apiFetch<{ id: string }>("/menu-items", { method: "POST", body: JSON.stringify(payload) }),
  updateDish: (id: string, payload: { name?: string; pricePaise?: number; productionUnitId?: string | null; active?: boolean }) =>
    apiFetch<{ id: string }>(`/menu-items/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteDish: (id: string) => apiFetch<{ id: string; deleted: boolean }>(`/menu-items/${id}`, { method: "DELETE" }),
  submitOrder: (payload: { tableId: string; captainId: string; pax: number; items: Array<{ menuItemId: string; quantity: number }> }) =>
    apiFetch<{ orderId: string; kotIds: string[] }>("/orders/submit", {
      method: "POST",
      idempotent: "orders-submit",
      body: JSON.stringify({ ...payload, orderType: "dine_in" })
    }),
  generateBill: (orderId: string) => apiFetch<{ billId: string; totalPaise: number }>(`/bills/${orderId}/generate`, { method: "POST", idempotent: "bill-generate" }),
  settleBill: (
    billId: string,
    payload: {
      discountType: "amount" | "percent";
      discountValue: number;
      tipPaise: number;
      payments: Array<{ method: "cash" | "upi" | "card" | "online"; amountPaise: number; reference?: string }>;
    }
  ) =>
    apiFetch<{ billId: string; status: string; remainingPaise: number }>(`/bills/${billId}/settle`, {
      method: "POST",
      idempotent: "bill-settle",
      body: JSON.stringify({ ...payload, receivedBy: "cashier" })
    }),
  cancelOrder: (orderId: string) =>
    apiFetch<{ orderId: string }>(`/orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "Cancelled by cashier" })
    }),
  updateKotStatus: (kotId: string, status: string) =>
    apiFetch<{ id: string }>(`/kot/${kotId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  processPrints: () => apiFetch<{ printed: number; failed: number }>("/print-jobs/process", { method: "POST" }),
  pullCloud: () => apiFetch<{ applied: number }>("/sync/pull", { method: "POST" })
};
