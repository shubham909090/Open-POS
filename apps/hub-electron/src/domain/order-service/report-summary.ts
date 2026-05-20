import type { SqliteDatabase } from "../../db/database.js";
import { DomainError } from "../errors.js";
import { allocateByWeight } from "./billing-calculations.js";
import type { BusinessDayRow, DaySummary, GroupSummaryAccumulator } from "./types.js";

type BillSummaryRow = {
  bill_id: string;
  bill_number: number;
  order_id: string;
  table_name: string;
  status: string;
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  discount_paise: number;
  tip_paise: number;
  final_total_paise: number;
  settled_at: string | null;
  is_nc: number;
  nc_reason: string | null;
  revision_number: number;
};

type BillItemSummaryRow = {
  bill_id: string;
  order_item_id: string;
  menu_item_id: string | null;
  menu_item_variant_id: string | null;
  name: string;
  quantity: number;
  unit_price_paise: number;
  line_total_paise: number;
  sale_group_id: string;
  production_unit_id: string | null;
};

export function buildDaySummary(db: SqliteDatabase, posDayId: string): DaySummary {
  const businessDay = db
    .prepare("SELECT id, business_date, period_start_at, period_end_at, status FROM pos_days WHERE id = ?")
    .get(posDayId) as BusinessDayRow | undefined;
  if (!businessDay) throw new DomainError("Business day not found", 404);

  const orders = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM orders
       WHERE pos_day_id = ?
       GROUP BY status`
    )
    .all(posDayId) as Array<{ status: string; count: number }>;
  const bills = db
    .prepare(
      `SELECT b.status, COUNT(*) AS count
       FROM bills b
       JOIN orders o ON o.id = b.order_id
       WHERE o.pos_day_id = ?
       GROUP BY b.status`
    )
    .all(posDayId) as Array<{ status: string; count: number }>;
  const payments = db
    .prepare(
      `SELECT p.method, COALESCE(SUM(p.amount_paise), 0) AS total
       FROM payments p
       JOIN bills b ON b.id = p.bill_id
       JOIN orders o ON o.id = b.order_id
       WHERE o.pos_day_id = ? AND b.is_nc = 0
       GROUP BY p.method`
    )
    .all(posDayId) as Array<{ method: string; total: number }>;
  const billTotals = db
    .prepare(
      `SELECT
         COUNT(*) AS bill_count,
         COALESCE(SUM(total_paise), 0) AS gross_sales_paise,
         COALESCE(SUM(discount_paise), 0) AS discount_paise,
         COALESCE(SUM(tip_paise), 0) AS tip_paise,
         COALESCE(SUM(final_total_paise), 0) AS final_sales_paise
       FROM bills b
       JOIN orders o ON o.id = b.order_id
       WHERE o.pos_day_id = ? AND b.is_nc = 0`
    )
    .get(posDayId) as {
    bill_count: number;
    gross_sales_paise: number;
    discount_paise: number;
    tip_paise: number;
    final_sales_paise: number;
  };
  const billRows = db
    .prepare(
      `SELECT b.id AS bill_id, b.bill_number, b.order_id, b.status, b.subtotal_paise, b.tax_paise,
        b.total_paise, b.discount_paise, b.tip_paise, b.final_total_paise, b.settled_at,
        b.is_nc, b.nc_reason, b.revision_number, t.name AS table_name
       FROM bills b
       JOIN orders o ON o.id = b.order_id
       JOIN restaurant_tables t ON t.id = o.table_id
       WHERE o.pos_day_id = ?
       ORDER BY b.bill_number ASC, b.created_at ASC`
    )
    .all(posDayId) as BillSummaryRow[];
  const paymentRows = db
    .prepare(
      `SELECT p.bill_id, p.method, p.amount_paise, p.reference
       FROM payments p
       JOIN bills b ON b.id = p.bill_id
       JOIN orders o ON o.id = b.order_id
       WHERE o.pos_day_id = ? AND b.is_nc = 0
       ORDER BY p.created_at ASC`
    )
    .all(posDayId) as Array<{ bill_id: string; method: string; amount_paise: number; reference: string | null }>;
  const billItemRows = db
    .prepare(
      `SELECT b.id AS bill_id, oi.id AS order_item_id, oi.menu_item_id, oi.menu_item_variant_id,
        oi.name_snapshot AS name, oi.quantity, oi.unit_price_paise, oi.sale_group_id, oi.production_unit_id,
        (oi.quantity * oi.unit_price_paise) AS line_total_paise
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN bills b ON b.order_id = o.id
       WHERE o.pos_day_id = ? AND oi.status != 'cancelled'
       ORDER BY b.bill_number ASC, oi.created_at ASC, oi.id ASC`
    )
    .all(posDayId) as BillItemSummaryRow[];
  const itemSummaries = db
    .prepare(
      `SELECT COALESCE(oi.menu_item_id, oi.id) AS menu_item_id, oi.name_snapshot AS name, oi.sale_group_id, oi.sale_group_name_snapshot,
        oi.sale_group_kind_snapshot,
        COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 0 THEN oi.quantity ELSE 0 END), 0) AS quantity,
        COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 0 THEN oi.quantity * oi.unit_price_paise ELSE 0 END), 0) AS gross_sales_paise,
        COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 1 THEN oi.quantity ELSE 0 END), 0) AS nc_quantity,
        COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 1 THEN oi.quantity * oi.unit_price_paise ELSE 0 END), 0) AS nc_gross_sales_paise
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN bills b ON b.order_id = o.id
       WHERE o.pos_day_id = ? AND oi.status != 'cancelled'
       GROUP BY COALESCE(oi.menu_item_id, oi.id), oi.name_snapshot, oi.sale_group_id, oi.sale_group_name_snapshot, oi.sale_group_kind_snapshot
       ORDER BY oi.name_snapshot ASC`
    )
    .all(posDayId) as Array<{
    menu_item_id: string;
    name: string;
    sale_group_id: string;
    sale_group_name_snapshot: string;
    sale_group_kind_snapshot: string;
    quantity: number;
    gross_sales_paise: number;
    nc_quantity: number;
    nc_gross_sales_paise: number;
  }>;
  const groupSummaries = db
    .prepare(
      `SELECT oi.sale_group_id, oi.sale_group_name_snapshot, oi.sale_group_kind_snapshot,
        COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 0 THEN oi.quantity ELSE 0 END), 0) AS quantity,
        COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 0 THEN oi.quantity * oi.unit_price_paise ELSE 0 END), 0) AS gross_sales_paise,
        COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 0 THEN oi.tax_paise ELSE 0 END), 0) AS tax_paise,
        COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 1 THEN oi.quantity ELSE 0 END), 0) AS nc_quantity,
        COALESCE(SUM(CASE WHEN COALESCE(b.is_nc, 0) = 1 THEN oi.quantity * oi.unit_price_paise ELSE 0 END), 0) AS nc_gross_sales_paise
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN bills b ON b.order_id = o.id
       WHERE o.pos_day_id = ? AND oi.status != 'cancelled'
       GROUP BY oi.sale_group_id, oi.sale_group_name_snapshot, oi.sale_group_kind_snapshot
       ORDER BY oi.sale_group_name_snapshot`
    )
    .all(posDayId) as Array<{
    sale_group_id: string;
    sale_group_name_snapshot: string;
    sale_group_kind_snapshot: string;
    quantity: number;
    gross_sales_paise: number;
    tax_paise: number;
    nc_quantity: number;
    nc_gross_sales_paise: number;
  }>;
  const billGroupRows = db
    .prepare(
      `SELECT b.id AS bill_id, oi.sale_group_id, oi.sale_group_name_snapshot, oi.sale_group_kind_snapshot,
        COALESCE(SUM(oi.quantity * oi.unit_price_paise), 0) AS gross_sales_paise,
        COALESCE(SUM(oi.tax_paise), 0) AS tax_paise
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN bills b ON b.order_id = o.id
       WHERE o.pos_day_id = ? AND oi.status != 'cancelled' AND b.is_nc = 0
       GROUP BY b.id, oi.sale_group_id, oi.sale_group_name_snapshot, oi.sale_group_kind_snapshot`
    )
    .all(posDayId) as Array<{
    bill_id: string;
    sale_group_id: string;
    sale_group_name_snapshot: string;
    sale_group_kind_snapshot: string;
    gross_sales_paise: number;
    tax_paise: number;
  }>;

  const groupSummaryMap = new Map<string, GroupSummaryAccumulator>();
  for (const group of groupSummaries) {
    groupSummaryMap.set(group.sale_group_id, {
      saleGroupId: group.sale_group_id,
      name: group.sale_group_name_snapshot,
      kind: group.sale_group_kind_snapshot,
      quantity: group.quantity,
      grossSalesPaise: group.gross_sales_paise,
      taxPaise: group.tax_paise,
      finalSalesPaise: 0,
      ncQuantity: group.nc_quantity,
      ncGrossSalesPaise: group.nc_gross_sales_paise
    });
  }

  const billRowsById = new Map(billRows.map((bill) => [bill.bill_id, bill]));
  const billGroupRowsByBill = new Map<string, typeof billGroupRows>();
  for (const row of billGroupRows) {
    billGroupRowsByBill.set(row.bill_id, [...(billGroupRowsByBill.get(row.bill_id) ?? []), row]);
  }
  for (const [billId, rows] of billGroupRowsByBill.entries()) {
    const bill = billRowsById.get(billId);
    if (!bill || bill.is_nc) continue;
    const bases = rows.map((row) => row.gross_sales_paise);
    const discountShares = allocateByWeight(bill.discount_paise, bases);
    const tipShares = allocateByWeight(bill.tip_paise, bases);
    rows.forEach((row, index) => {
      const summary = groupSummaryMap.get(row.sale_group_id);
      if (!summary) return;
      summary.finalSalesPaise += row.gross_sales_paise - (discountShares[index] ?? 0) + (tipShares[index] ?? 0);
    });
  }

  const orderCounts = Object.fromEntries(orders.map((row) => [row.status, row.count]));
  const billCounts = Object.fromEntries(bills.map((row) => [row.status, row.count]));
  const paymentTotals = Object.fromEntries(payments.map((row) => [row.method, row.total]));
  const cashPaymentsPaise = paymentTotals.cash ?? 0;
  const upiPaymentsPaise = paymentTotals.upi ?? 0;
  const cardPaymentsPaise = paymentTotals.card ?? 0;
  const onlinePaymentsPaise = paymentTotals.online ?? 0;
  const totalPaymentsPaise = cashPaymentsPaise + upiPaymentsPaise + cardPaymentsPaise + onlinePaymentsPaise;
  const paymentsByBill = new Map<string, Array<{ method: string; amountPaise: number; reference: string | null }>>();
  for (const payment of paymentRows) {
    const list = paymentsByBill.get(payment.bill_id) ?? [];
    list.push({ method: payment.method, amountPaise: payment.amount_paise, reference: payment.reference });
    paymentsByBill.set(payment.bill_id, list);
  }

  const itemsByBill = new Map<string, Array<DaySummary["billSummaries"][number]["items"][number]>>();
  for (const item of billItemRows) {
    const list = itemsByBill.get(item.bill_id) ?? [];
    list.push({
      orderItemId: item.order_item_id,
      menuItemId: item.menu_item_id,
      menuItemVariantId: item.menu_item_variant_id,
      name: item.name,
      quantity: item.quantity,
      unitPricePaise: item.unit_price_paise,
      lineTotalPaise: item.line_total_paise,
      saleGroupId: item.sale_group_id,
      productionUnitId: item.production_unit_id
    });
    itemsByBill.set(item.bill_id, list);
  }

  return {
    businessDay,
    openOrders: orderCounts.open ?? 0,
    billedOrders: orderCounts.billed ?? 0,
    paidBills: billCounts.paid ?? 0,
    unpaidBills: billCounts.pending ?? 0,
    cancelledOrders: orderCounts.cancelled ?? 0,
    billCount: billTotals.bill_count,
    grossSalesPaise: billTotals.gross_sales_paise,
    discountPaise: billTotals.discount_paise,
    tipPaise: billTotals.tip_paise,
    finalSalesPaise: billTotals.final_sales_paise,
    cashPaymentsPaise,
    upiPaymentsPaise,
    cardPaymentsPaise,
    onlinePaymentsPaise,
    totalPaymentsPaise,
    nonCashPaymentsPaise: upiPaymentsPaise + cardPaymentsPaise + onlinePaymentsPaise,
    billSummaries: billRows.map((bill) => ({
      billId: bill.bill_id,
      billNumber: bill.bill_number,
      orderId: bill.order_id,
      tableName: bill.table_name,
      status: bill.status,
      subtotalPaise: bill.subtotal_paise,
      taxPaise: bill.tax_paise,
      totalPaise: bill.total_paise,
      discountPaise: bill.discount_paise,
      tipPaise: bill.tip_paise,
      finalTotalPaise: bill.final_total_paise,
      paidPaise: (paymentsByBill.get(bill.bill_id) ?? []).reduce((total, payment) => total + payment.amountPaise, 0),
      settledAt: bill.settled_at,
      payments: paymentsByBill.get(bill.bill_id) ?? [],
      items: itemsByBill.get(bill.bill_id) ?? [],
      isNc: Boolean(bill.is_nc),
      ncReason: bill.nc_reason,
      revisionNumber: bill.revision_number,
      modified: bill.revision_number > 1
    })),
    itemSummaries: itemSummaries.map((item) => ({
      menuItemId: item.menu_item_id,
      name: item.name,
      saleGroupId: item.sale_group_id,
      saleGroupName: item.sale_group_name_snapshot,
      saleGroupKind: item.sale_group_kind_snapshot,
      quantity: item.quantity,
      grossSalesPaise: item.gross_sales_paise,
      ncQuantity: item.nc_quantity,
      ncGrossSalesPaise: item.nc_gross_sales_paise
    })),
    groupSummaries: [...groupSummaryMap.values()]
  };
}
