import type { BillPrinterSlot } from "./mobile-types";

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
  floors: Array<{ id: string; name: string; active?: number | boolean }>;
  productionUnits: Array<{ id: string; name: string; active?: number | boolean; kds_enabled?: number | boolean }>;
  menuItems: Array<{
    id: string;
    name: string;
    price_paise: number;
    production_unit_id: string | null;
    production_unit_name: string | null;
    sale_group_id: string;
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

export interface BillPrinterProfile {
  label: string;
  printerMode: "system" | "network";
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
  configured: boolean;
}

export interface BillPrinters {
  default: BillPrinterProfile;
  alternate: BillPrinterProfile;
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
    note?: string | null;
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
  billSummaries?: Array<{
    billId: string;
    billNumber?: number;
    orderId: string;
    tableName: string;
    status: string;
    subtotalPaise?: number;
    taxPaise?: number;
    totalPaise: number;
    discountPaise: number;
    tipPaise: number;
    finalTotalPaise: number;
    paidPaise: number;
    settledAt: string | null;
    payments: Array<{ method: string; amountPaise: number; reference: string | null }>;
    items?: Array<{
      orderItemId?: string;
      menuItemId?: string | null;
      menuItemVariantId?: string | null;
      saleGroupId?: string;
      productionUnitId?: string | null;
      name: string;
      quantity: number;
      unitPricePaise: number;
      lineTotalPaise: number;
    }>;
    isNc?: boolean;
    ncReason?: string | null;
    revisionNumber?: number;
    modified?: boolean;
  }>;
  groupSummaries?: Array<{ name: string; kind: string; quantity: number; grossSalesPaise: number; finalSalesPaise: number }>;
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

export interface DailyReportDetail extends DailyReportRow {
  billSummaries: NonNullable<CurrentDaySummary["billSummaries"]>;
  groupSummaries?: CurrentDaySummary["groupSummaries"];
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

export interface KdsTicket {
  id: string;
  sequence: number;
  table_name: string;
  status: "queued" | "preparing" | "ready" | "served" | "cancelled" | string;
  captain_id: string;
  note?: string | null;
  items: Array<{ name_snapshot: string; quantity_delta: number; note_snapshot?: string | null }>;
}

export interface HubRealtimeEvent {
  type?: string;
  result?: unknown;
}

export interface ManagerApprovalPayload {
  managerApproval: {
    pin: string;
    reason: string;
    approvedBy: string;
  };
}

export interface MasterApprovalPayload {
  masterApproval: {
    pin: string;
    reason: string;
    approvedBy: string;
  };
}

export interface RequestOptions {
  idempotencyKey?: string;
  printerSlot?: BillPrinterSlot;
}
