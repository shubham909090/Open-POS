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
    name_snapshot: string;
    unit_price_paise: number;
    quantity: number;
    status: string;
  }>;
  bill: { id: string; total_paise: number; status: string } | null;
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

  async submitOrder(input: SubmitOrderInput): Promise<{ orderId: string; kotIds: string[] }> {
    return this.request("/orders/submit", {
      method: "POST",
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
