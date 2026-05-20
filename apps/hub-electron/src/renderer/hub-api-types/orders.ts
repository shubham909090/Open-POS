export type BillAdjustmentPayload = {
  discountType?: "amount" | "percent";
  discountValue?: number;
  tipPaise?: number;
};

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
  note?: string | null;
  is_open_item?: boolean | number;
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

export interface KdsTicket {
  id: string;
  sequence: number;
  table_name: string;
  status: string;
  captain_id: string;
  note?: string | null;
  items: Array<{ name_snapshot: string; quantity_delta: number; note_snapshot?: string | null }>;
}
