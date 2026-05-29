import type {
  BulkDeleteAlcoholItemsInput,
  BulkDeleteMenuItemsInput,
  MenuItemDeleteApprovalInput,
  TaxComponentAmount,
  UserRole
} from "@gaurav-pos/shared";

export type BillPrinterProfile = {
  label: string;
  printerMode: "system" | "network";
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
  configured: boolean;
};

export type BillPrinterProfiles = {
  default: BillPrinterProfile;
  alternate: BillPrinterProfile;
};

export const DEFAULT_TAX_COMPONENTS = [
  { name: "CGST", rateBps: 250 },
  { name: "SGST", rateBps: 250 }
];

export interface BusinessDayRow {
  id: string;
  business_date: string;
  period_start_at: string;
  period_end_at: string;
  status: string;
}

export interface TableRow {
  id: string;
  name: string;
  status: string;
  current_order_id: string | null;
  occupied_at?: string | null;
}

export interface MenuItemRow {
  id: string;
  name: string;
  price_paise: number;
  production_unit_id: string | null;
  sale_group_id: string;
  sale_group_name: string;
  sale_group_kind: string;
  ticket_label: string;
  tax_components_json: string;
  unit_name: string | null;
  printer_host: string | null;
  printer_port: number | null;
  printer_name: string | null;
}

export interface MenuItemVariantRow {
  id: string;
  menu_item_id: string;
  label: string;
  kind: string;
  price_paise: number;
  volume_ml: number | null;
  inventory_action: string;
  sort_order: number;
  active: boolean | number;
}

export interface OrderRow {
  id: string;
  table_id: string;
  pos_day_id: string;
  status: string;
  captain_id: string;
  captain_device_id: string | null;
  created_by_device_id: string | null;
  created_by_role: UserRole | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  menu_item_variant_id: string | null;
  name_snapshot: string;
  variant_name_snapshot: string;
  variant_volume_ml: number | null;
  inventory_action_snapshot: string;
  alcohol_recipe_snapshot_json: string;
  unit_price_paise: number;
  quantity: number;
  production_unit_id: string | null;
  sale_group_id: string;
  sale_group_name_snapshot: string;
  sale_group_kind_snapshot: string;
  ticket_label_snapshot: string;
  tax_components_json: string;
  tax_paise: number;
  note: string | null;
  is_open_item: boolean;
  status: string;
}

export interface UnitRow {
  id: string;
  name: string;
  printer_host: string;
  printer_port: number;
  printer_name: string | null;
  kds_enabled?: number;
}

export interface BillRow {
  id: string;
  bill_number: number;
  order_id: string;
  status: string;
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  discount_paise: number;
  tip_paise: number;
  final_total_paise: number;
  tax_breakdown_json: string;
  revision_number: number;
  print_count: number;
  is_nc: boolean;
  nc_reason: string | null;
  created_at: string;
}

export interface SaleGroupRow {
  id: string;
  name: string;
  kind: string;
  report_label: string;
  ticket_label: "KOT" | "BOT";
  tax_components_json: string;
  default_production_unit_id: string | null;
}

export interface BillTotals {
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  taxBreakdown: TaxComponentAmount[];
}

export type CsvImportResult = {
  created: number;
  failed: number;
  ids: string[];
  errors: Array<{ row: number; message: string }>;
};

export type CsvRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export interface DaySummary {
  businessDay: {
    id: string;
    business_date: string;
    period_start_at: string;
    period_end_at: string;
    status: string;
  };
  openOrders: number;
  billedOrders: number;
  paidBills: number;
  unpaidBills: number;
  cancelledOrders: number;
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
  billSummaries: Array<{
    billId: string;
    billNumber?: number;
    orderId: string;
    tableName: string;
    status: string;
    subtotalPaise: number;
    taxPaise: number;
    totalPaise: number;
    discountPaise: number;
    tipPaise: number;
    finalTotalPaise: number;
    paidPaise: number;
    settledAt: string | null;
    payments: Array<{ method: string; amountPaise: number; reference: string | null }>;
    items: Array<{ orderItemId: string; menuItemId: string | null; menuItemVariantId: string | null; name: string; quantity: number; unitPricePaise: number; lineTotalPaise: number; saleGroupId: string; productionUnitId: string | null }>;
    isNc?: boolean;
    ncReason?: string | null;
    revisionNumber?: number;
    modified?: boolean;
  }>;
  itemSummaries: Array<{
    menuItemId: string;
    name: string;
    saleGroupId: string;
    saleGroupName: string;
    saleGroupKind: string;
    quantity: number;
    grossSalesPaise: number;
    ncQuantity: number;
    ncGrossSalesPaise: number;
  }>;
  groupSummaries: Array<{
    saleGroupId: string;
    name: string;
    kind: string;
    quantity: number;
    grossSalesPaise: number;
    taxPaise: number;
    finalSalesPaise: number;
    ncQuantity: number;
    ncGrossSalesPaise: number;
  }>;
}

export interface DailyReportSnapshotRow {
  pos_day_id: string;
  business_date: string;
  status: string;
  bill_count: number;
  open_orders: number;
  billed_orders: number;
  paid_bills: number;
  unpaid_bills: number;
  cancelled_orders: number;
  gross_sales_paise: number;
  discount_paise: number;
  tip_paise: number;
  final_sales_paise: number;
  cash_payments_paise: number;
  upi_payments_paise: number;
  card_payments_paise: number;
  online_payments_paise: number;
  total_payments_paise: number;
  non_cash_payments_paise: number;
  bill_summaries_json: string;
  item_summaries_json: string;
  group_summaries_json: string;
  finalized_at: string;
  updated_at: string;
}

export interface KotItemChange {
  menuItemId: string | null;
  orderItemId: string | null;
  name: string;
  quantityDelta: number;
  note?: string | null;
  noteChanged?: boolean;
  productionUnitId: string | null;
  productionUnitName: string;
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
  ticketLabel: string;
}

export interface AlcoholStockRow {
  menu_item_id: string;
  sealed_large_count: number;
  open_large_ml: number;
  sealed_small_count: number;
  large_bottle_ml: number;
  small_bottle_ml: number;
}

export interface GroupSummaryAccumulator {
  saleGroupId: string;
  name: string;
  kind: string;
  quantity: number;
  grossSalesPaise: number;
  taxPaise: number;
  finalSalesPaise: number;
  ncQuantity: number;
  ncGrossSalesPaise: number;
}

export interface RequestedOrderItem {
  itemKey: string;
  menuItemId: string | null;
  menuItemVariantId: string | null;
  quantity: number;
  name: string;
  variantName: string;
  variantVolumeMl: number | null;
  inventoryAction: string;
  alcoholRecipeSnapshotJson: string;
  unitPricePaise: number;
  productionUnitId: string | null;
  saleGroupId: string;
  saleGroupName: string;
  saleGroupKind: string;
  ticketLabel: string;
  taxComponentsJson: string;
  note: string | null;
  isOpenItem: boolean;
}

export interface DeviceActor {
  id: string;
  name: string;
  role: UserRole;
}

export interface AlcoholRecipeSnapshotIngredient {
  liquorMenuItemId: string;
  mlPerUnit: number;
}

export interface TicketCreationResult {
  kotIds: string[];
  printJobIds: string[];
}

export type BulkMenuDeleteKind = "dish" | "alcohol";
export type BulkMenuDeleteInput = Partial<BulkDeleteMenuItemsInput & BulkDeleteAlcoholItemsInput> | MenuItemDeleteApprovalInput;
export type BulkMenuDeleteResult = {
  deleted: number;
  disabled: number;
  failed: number;
  errors: Array<{ id: string; name?: string; message: string }>;
};
