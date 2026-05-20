import type { SubmitOrderInput } from "@gaurav-pos/shared";
import { buildRealtimeUrl, createIdempotencyKey, HubHttpError } from "./hub-client-helpers";
import type {
  BillPrinters,
  CurrentDaySummary,
  DailyReportDetail,
  DailyReportRow,
  HubBootstrap,
  HubDeviceSession,
  HubOrder,
  HubRealtimeEvent,
  KdsTicket,
  ManagerApprovalPayload,
  MasterApprovalPayload,
  ReadyNotification,
  RequestOptions,
} from "./hub-client-types";

export type {
  BillPrinterProfile,
  BillPrinters,
  CurrentDaySummary,
  DailyReportDetail,
  DailyReportRow,
  HubBootstrap,
  HubDeviceSession,
  HubOrder,
  HubRealtimeEvent,
  KdsTicket,
  ManagerApprovalPayload,
  MasterApprovalPayload,
  ReadyNotification,
  RequestOptions,
} from "./hub-client-types";
export {
  buildRealtimeUrl,
  getLocalOnlyHubUrlMessage,
  getPairingFailureAlert,
  HubHttpError,
  isHubHttpError,
} from "./hub-client-helpers";

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

  async billPrinters(): Promise<BillPrinters> {
    return this.request("/settings/bill-printers");
  }

  async tableOrder(tableId: string): Promise<HubOrder | null> {
    return this.request(`/tables/${tableId}/order`);
  }

  async currentBusinessDaySummary(): Promise<CurrentDaySummary> {
    return this.request("/business-day/current-summary");
  }

  async dailyReports(): Promise<DailyReportRow[]> {
    return this.request("/reports/daily");
  }

  async dailyReport(posDayId: string): Promise<DailyReportDetail> {
    return this.request(`/reports/daily/${posDayId}`);
  }

  async submitOrder(input: SubmitOrderInput, options: RequestOptions = {}): Promise<{ orderId: string; kotIds: string[] }> {
    return this.request("/orders/submit", {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-order") },
      body: JSON.stringify(input)
    });
  }

  async updateOrderState(
    orderId: string,
    input: {
      saveMode: "save" | "save_print";
      items: SubmitOrderInput["items"];
      managerApproval?: ManagerApprovalPayload["managerApproval"];
    },
    options: RequestOptions = {}
  ): Promise<{ orderId: string; status: string; totalPaise: number; kotIds: string[]; printJobIds?: string[] }> {
    return this.request(`/orders/${orderId}/state`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-order-state") },
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

  async cancelItems(orderId: string, input: ManagerApprovalPayload & { items: Array<{ orderItemId: string; quantity: number }> }): Promise<{ orderId: string; kotIds: string[] }> {
    return this.request(`/orders/${orderId}/items/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: input.managerApproval.reason, ...input })
    });
  }

  async readyNotifications(): Promise<ReadyNotification[]> {
    return this.request("/notifications/ready");
  }

  async kds(productionUnitId: string): Promise<KdsTicket[]> {
    return this.request(`/kds/${productionUnitId}`);
  }

  async updateKotStatus(kotId: string, status: "queued" | "preparing" | "ready" | "served" | "cancelled"): Promise<{ id: string; status: string }> {
    return this.request(`/kot/${kotId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  }

  subscribeRealtime(onEvent: (event: HubRealtimeEvent) => void): () => void {
    if (!this.deviceToken || typeof WebSocket === "undefined") return () => {};
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;
    let retryDelayMs = 1_500;

    const open = () => {
      let realtimeUrl: string;
      try {
        realtimeUrl = buildRealtimeUrl(this.baseUrl, this.deviceToken);
      } catch {
        return;
      }
      socket = new WebSocket(realtimeUrl);
      socket.onopen = () => {
        retryDelayMs = 1_500;
      };
      socket.onmessage = (message) => {
        try {
          onEvent(JSON.parse(String(message.data)) as HubRealtimeEvent);
        } catch {
          // The polling refresh path still keeps the phone truthful.
        }
      };
      socket.onclose = () => {
        if (!closed) {
          const delay = retryDelayMs;
          retryDelayMs = Math.min(15_000, retryDelayMs * 2);
          retry = setTimeout(open, delay);
        }
      };
      socket.onerror = () => socket?.close();
    };

    open();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }

  async generateBill(orderId: string, options: RequestOptions = {}): Promise<{ billId: string; billNumber: number; totalPaise: number; printJobId: string }> {
    return this.request(`/bills/${orderId}/generate`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-generate") },
      body: JSON.stringify({ printerSlot: options.printerSlot ?? "default" })
    });
  }

  async printBill(billId: string, options: RequestOptions = {}): Promise<{ printJobId: string }> {
    return this.request(`/bills/${billId}/print`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-print") },
      body: JSON.stringify({ printerSlot: options.printerSlot ?? "default" })
    });
  }

  async historyReprintBill(billId: string, options: RequestOptions = {}): Promise<{ printJobId: string }> {
    return this.request(`/bills/${billId}/history-reprint`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-history-reprint") },
      body: JSON.stringify({ printerSlot: options.printerSlot ?? "default" })
    });
  }

  async historyEditBill(
    billId: string,
    input: MasterApprovalPayload & {
      items: Array<
        | { orderItemId?: string; menuItemId: string; menuItemVariantId?: string; quantity: number }
        | { orderItemId?: string; openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null; quantity: number }
      >;
    },
    options: RequestOptions = {}
  ): Promise<{ billId: string; revisionNumber: number; totalPaise: number; printJobId: string; modified: boolean }> {
    return this.request(`/bills/${billId}/history-edit`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-history-edit") },
      body: JSON.stringify({ ...input, printerSlot: options.printerSlot ?? "default" })
    });
  }

  async reprintBill(billId: string, input: ManagerApprovalPayload, options: RequestOptions = {}): Promise<{ printJobId: string }> {
    return this.request(`/bills/${billId}/reprint`, {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey ?? createIdempotencyKey("mobile-bill-reprint") },
      body: JSON.stringify({ reason: input.managerApproval.reason, ...input, printerSlot: options.printerSlot ?? "default" })
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
      body: JSON.stringify({ ...input, printerSlot: options.printerSlot ?? "default" })
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
      throw new HubHttpError(body.error ?? `Hub request failed: ${response.status}`, response.status);
    }

    return response.json() as Promise<T>;
  }
}
