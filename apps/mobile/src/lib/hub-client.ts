import type { SubmitOrderInput } from "@gaurav-pos/shared";

export interface HubBootstrap {
  currentBusinessDay: { id: string; business_date: string; period_start_at: string; period_end_at: string; status: string };
  tables: Array<{
    id: string;
    floor_id: string;
    floor_name: string;
    name: string;
    status: string;
    active?: number | boolean;
    current_order_id: string | null;
  }>;
  productionUnits: Array<{ id: string; name: string }>;
  menuItems: Array<{
    id: string;
    name: string;
    price_paise: number;
    production_unit_id: string | null;
    production_unit_name: string | null;
    sale_group_name?: string;
    sale_group_kind?: string;
    active: number;
    variants?: Array<{
      id: string;
      label: string;
      kind: string;
      price_paise: number;
      volume_ml: number | null;
      inventory_action: string;
      active: number | boolean;
    }>;
  }>;
  menuPopularity?: Array<{ menuItemId: string; quantity: number }>;
  syncStatus?: { counts: Record<string, number> };
}

export interface HubDeviceSession {
  id: string;
  name: string;
  role: string;
}

export interface HubOrder {
  order: { id: string; status: string; table_id: string; pax: number };
  items: Array<{
    id: string;
    menu_item_id: string | null;
    menu_item_variant_id?: string | null;
    name_snapshot: string;
    unit_price_paise: number;
    quantity: number;
    sale_group_id?: string;
    production_unit_id?: string | null;
    status: string;
  }>;
  bill: {
    id: string;
    total_paise: number;
    discount_paise?: number;
    tip_paise?: number;
    final_total_paise?: number;
    paid_paise?: number;
    status: string;
    revision_number?: number;
    is_nc?: boolean;
    nc_reason?: string | null;
  } | null;
  payments?: Array<{ id: string; method: string; amount_paise: number; reference?: string | null }>;
}

export interface CurrentDaySummary {
  businessDay: { business_date: string; period_start_at: string; period_end_at: string };
  billCount: number;
  openOrders: number;
  billedOrders: number;
  paidBills: number;
  unpaidBills: number;
  grossSalesPaise: number;
  discountPaise: number;
  tipPaise: number;
  finalSalesPaise: number;
  cashPaymentsPaise: number;
  upiPaymentsPaise: number;
  cardPaymentsPaise: number;
  onlinePaymentsPaise: number;
  totalPaymentsPaise: number;
  groupSummaries?: Array<{ name: string; kind: string; quantity: number; grossSalesPaise: number; finalSalesPaise: number }>;
}

export interface ReadyNotification {
  id: string;
  kotId: string;
  orderId: string;
  tableId: string;
  tableName: string;
  productionUnitName: string;
  items: Array<{ name: string; quantity: number }>;
  createdAt: string;
}

export class HubClient {
  constructor(
    private readonly baseUrl: string,
    private readonly deviceToken: string
  ) {}

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async bootstrap(): Promise<HubBootstrap> {
    return this.request("/sync/bootstrap");
  }

  async me(): Promise<HubDeviceSession> {
    return this.request("/devices/me");
  }

  async tableOrder(tableId: string): Promise<HubOrder | null> {
    return this.request(`/tables/${tableId}/order`);
  }

  async currentBusinessDaySummary(): Promise<CurrentDaySummary> {
    return this.request("/business-day/current-summary");
  }

  async submitOrder(input: SubmitOrderInput, options: RequestOptions = {}): Promise<{ orderId: string; kotIds: string[] }> {
    return this.request("/orders/submit", {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-order") },
      body: JSON.stringify(input)
    });
  }

  async moveTable(input: { fromTableId: string; toTableId: string; reason: string }): Promise<{ orderId: string; kotIds: string[] }> {
    return this.request("/tables/move", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async moveItems(input: { fromTableId: string; toTableId: string; reason: string; items: Array<{ orderItemId: string; quantity: number }> }): Promise<{ fromOrderId: string; toOrderId: string; sourceKotIds: string[]; targetKotIds: string[] }> {
    return this.request("/orders/items/move", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async readyNotifications(): Promise<ReadyNotification[]> {
    return this.request("/notifications/ready");
  }

  async generateBill(orderId: string, options: RequestOptions = {}): Promise<{ billId: string; totalPaise: number }> {
    return this.request(`/bills/${orderId}/generate`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-generate") }
    });
  }

  async printBill(billId: string, options: RequestOptions = {}): Promise<{ printJobId: string }> {
    return this.request(`/bills/${billId}/print`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-print") },
      body: JSON.stringify({})
    });
  }

  async reprintBill(billId: string, input: ManagerApprovalPayload, options: RequestOptions = {}): Promise<{ printJobId: string }> {
    return this.request(`/bills/${billId}/reprint`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-reprint") },
      body: JSON.stringify({ reason: input.managerApproval.reason, ...input })
    });
  }

  async settleBill(
    billId: string,
    input: {
      discountType: "amount" | "percent";
      discountValue: number;
      tipPaise: number;
      payments: Array<{ method: "cash" | "upi" | "card" | "online"; amountPaise: number; reference?: string }>;
    },
    options: RequestOptions = {}
  ): Promise<{ billId: string; status: string; remainingPaise: number }> {
    return this.request(`/bills/${billId}/settle`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-settle") },
      body: JSON.stringify(input)
    });
  }

  async markBillNc(billId: string, input: ManagerApprovalPayload, options: RequestOptions = {}): Promise<{ printJobId: string }> {
    return this.request(`/bills/${billId}/nc`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-nc") },
      body: JSON.stringify(input)
    });
  }

  async reviseBill(
    billId: string,
    input: ManagerApprovalPayload & {
      items: Array<
        | { orderItemId?: string; menuItemId: string; menuItemVariantId?: string; quantity: number }
        | { orderItemId?: string; openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number }
      >;
    },
    options: RequestOptions = {}
  ): Promise<{ billId: string; revisionNumber: number; totalPaise: number; kotIds: string[] }> {
    return this.request(`/bills/${billId}/revise`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-revise") },
      body: JSON.stringify(input)
    });
  }

  async exchangePairingCode(input: { code: string; deviceName: string }): Promise<{
    deviceId: string;
    deviceName: string;
    role: string;
    token: string;
  }> {
    return this.request("/devices/pair/exchange", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "x-device-token": this.deviceToken,
      ...(init.headers as Record<string, string> | undefined)
    };
    if (init.body) headers["content-type"] = "application/json";

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Hub request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}

export interface ManagerApprovalPayload {
  managerApproval: {
    pin: string;
    reason: string;
    approvedBy: string;
  };
}

export interface RequestOptions {
  idempotencyKey?: string;
}

function createIdempotencyKey(prefix: string): string {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}
