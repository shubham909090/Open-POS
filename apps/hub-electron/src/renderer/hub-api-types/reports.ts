import type { PosDay } from "./catalog.js";

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
  billSummaries?: ReportBillSummary[];
  itemSummaries?: ReportItemSummary[];
  groupSummaries?: ReportGroupSummary[];
}

export interface ReportBillSummary {
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
}

export interface ReportItemSummary {
  menuItemId: string;
  name: string;
  saleGroupId: string;
  saleGroupName: string;
  saleGroupKind: string;
  quantity: number;
  grossSalesPaise: number;
  ncQuantity: number;
  ncGrossSalesPaise: number;
}

export interface ReportGroupSummary {
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
  billSummaries: ReportBillSummary[];
  itemSummaries: ReportItemSummary[];
  groupSummaries: ReportGroupSummary[];
}

export interface RangeReportDayRow extends DailyReportRow {
  discount_paise: number;
  tip_paise: number;
  cash_payments_paise: number;
  upi_payments_paise: number;
  card_payments_paise: number;
  online_payments_paise: number;
}

export interface RangeReportDetail {
  range: { from: string; to: string };
  availableDays: RangeReportDayRow[];
  missingDates: string[];
  unfinalizedDates: string[];
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
  billSummaries?: ReportBillSummary[];
  itemSummaries: ReportItemSummary[];
  groupSummaries: ReportGroupSummary[];
}
