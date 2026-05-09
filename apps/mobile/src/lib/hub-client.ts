import type { SubmitOrderInput } from "@gaurav-pos/shared";

export interface HubBootstrap {
  openDay: { id: string } | null;
  tables: Array<{
    id: string;
    floor_id: string;
    floor_name: string;
    name: string;
    status: string;
    current_order_id: string | null;
  }>;
  productionUnits: Array<{ id: string; name: string }>;
  menuItems: Array<{
    id: string;
    name: string;
    price_paise: number;
    production_unit_id: string;
    production_unit_name: string;
    active: number;
  }>;
  syncStatus: { counts: Record<string, number> };
}

export interface HubOrder {
  order: { id: string; status: string; table_id: string; pax: number };
  items: Array<{
    menu_item_id: string;
    name_snapshot: string;
    unit_price_paise: number;
    quantity: number;
    notes: string;
    status: string;
  }>;
  bill: { id: string; total_paise: number; status: string } | null;
}

export class HubClient {
  constructor(private readonly baseUrl: string) {}

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

  async tableOrder(tableId: string): Promise<HubOrder | null> {
    return this.request(`/tables/${tableId}/order`);
  }

  async submitOrder(input: SubmitOrderInput): Promise<{ orderId: string; kotIds: string[] }> {
    return this.request("/orders/submit", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Hub request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}
