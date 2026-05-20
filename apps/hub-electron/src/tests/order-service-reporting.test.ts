import { describe, expect, it } from "vitest";
import { createTestHub, insertDailySnapshot } from "./helpers.js";

describe("OrderService reporting summaries", () => {
  it("keeps billed tables in the current business-day summary until paid", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    orderService.generateBill(order.orderId);

    expect(orderService.getCurrentBusinessDaySummary()).toMatchObject({
      openOrders: 0,
      unpaidBills: 1,
      billedOrders: 1
    });

    database.close();
  });

  it("does not let an old unsettled day produce a finalized report", () => {
    const { database, orderService } = createTestHub();
    database.db
      .prepare(
        `INSERT INTO pos_days (id, outlet_id, business_date, status, period_start_at, period_end_at, created_at)
         VALUES ('day-old', 'outlet-test', '2026-05-08', 'active', '2026-05-07T00:30:00.000Z', '2026-05-08T00:30:00.000Z', '2026-05-07T00:30:00.000Z')`
      )
      .run();
    database.db
      .prepare(
        `INSERT INTO orders (id, table_id, pos_day_id, order_type, status, pax, captain_id, created_at, updated_at)
         VALUES ('order-old-open', 'table-t2', 'day-old', 'dine_in', 'open', 1, 'waiter-1', '2026-05-08T00:00:00.000Z', '2026-05-08T00:00:00.000Z')`
      )
      .run();

    expect(orderService.listDailyReports()).toHaveLength(0);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM daily_report_snapshots WHERE pos_day_id = 'day-old'").get()).toEqual({ count: 0 });

    database.close();
  });

  it("returns current business-day sales and payment summary", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    const discountPaise = 1_000;
    const tipPaise = 500;
    const finalTotalPaise = bill.totalPaise - discountPaise + tipPaise;
    orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      discountType: "amount",
      discountValue: discountPaise,
      tipPaise,
      payments: [
        { method: "cash", amountPaise: 10_000 },
        { method: "upi", amountPaise: finalTotalPaise - 10_000 }
      ]
    });

    expect(orderService.getCurrentBusinessDaySummary()).toMatchObject({
      openOrders: 0,
      unpaidBills: 0,
      paidBills: 1,
      grossSalesPaise: bill.totalPaise,
      discountPaise,
      tipPaise,
      finalSalesPaise: finalTotalPaise,
      cashPaymentsPaise: 10_000,
      upiPaymentsPaise: finalTotalPaise - 10_000,
      totalPaymentsPaise: finalTotalPaise
    });
    expect((orderService.getCurrentBusinessDaySummary() as { groupSummaries: Array<{ kind: string; finalSalesPaise: number }> }).groupSummaries).toContainEqual(
      expect.objectContaining({ kind: "food", finalSalesPaise: finalTotalPaise })
    );

    database.close();
  });

  it("exposes safe current-day menu popularity without payment totals in bootstrap", () => {
    const { database, orderService } = createTestHub();

    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "captain-1",
      pax: 2,
      orderType: "dine_in",
      items: [
        { menuItemId: "item-paneer-tikka", quantity: 3 },
        { menuItemId: "item-lassi", quantity: 1 }
      ]
    });

    const bootstrap = orderService.bootstrap() as {
      menuPopularity: Array<{ menuItemId: string; quantity: number; finalSalesPaise?: number }>;
    };

    expect(bootstrap.menuPopularity).toEqual([
      { menuItemId: "item-paneer-tikka", quantity: 3 },
      { menuItemId: "item-lassi", quantity: 1 }
    ]);
    expect(bootstrap.menuPopularity[0]).not.toHaveProperty("finalSalesPaise");

    database.close();
  });

  it("automatically finalizes old settled business days for cloud reports", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });
    const dayId = database.db.prepare("SELECT pos_day_id FROM orders WHERE id = ?").get(order.orderId) as { pos_day_id: string };
    database.db
      .prepare(
        `UPDATE pos_days
         SET business_date = '2026-05-08',
             period_start_at = '2026-05-07T00:30:00.000Z',
             period_end_at = '2026-05-08T00:30:00.000Z'
         WHERE id = ?`
      )
      .run(dayId.pos_day_id);

    const reports = orderService.listDailyReports();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ business_date: "2026-05-08", final_sales_paise: bill.totalPaise });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE type = 'daily_report.finalized'").get()).toEqual({ count: 1 });

    database.close();
  });

  it("aggregates finalized daily snapshots into closed-only range reports", () => {
    const { database, orderService } = createTestHub();
    insertDailySnapshot(database, {
      id: "day-range-1",
      businessDate: "2026-05-01",
      billCount: 2,
      finalSalesPaise: 50_000,
      cashPaise: 20_000,
      upiPaise: 30_000,
      itemSummaries: [{ menuItemId: "item-dal-fry", name: "Dal Fry", saleGroupId: "sg-food", saleGroupName: "Food", saleGroupKind: "food", quantity: 2, grossSalesPaise: 50_000, ncQuantity: 0, ncGrossSalesPaise: 0 }],
      groupSummaries: [{ saleGroupId: "sg-food", name: "Food", kind: "food", quantity: 2, grossSalesPaise: 50_000, taxPaise: 2_500, finalSalesPaise: 50_000, ncQuantity: 0, ncGrossSalesPaise: 0 }],
      billSummaries: [{ billId: "bill-old", billNumber: 1, orderId: "order-old", tableName: "T1", status: "paid", totalPaise: 50_000, discountPaise: 0, tipPaise: 0, finalTotalPaise: 50_000, paidPaise: 50_000, settledAt: "2026-05-01T18:00:00.000Z", payments: [], items: [] }]
    });
    insertDailySnapshot(database, {
      id: "day-range-2",
      businessDate: "2026-05-03",
      billCount: 1,
      finalSalesPaise: 25_000,
      cardPaise: 25_000,
      itemSummaries: [{ menuItemId: "item-dal-fry", name: "Dal Fry", saleGroupId: "sg-food", saleGroupName: "Food", saleGroupKind: "food", quantity: 1, grossSalesPaise: 25_000, ncQuantity: 0, ncGrossSalesPaise: 0 }],
      groupSummaries: [{ saleGroupId: "sg-food", name: "Food", kind: "food", quantity: 1, grossSalesPaise: 25_000, taxPaise: 1_250, finalSalesPaise: 25_000, ncQuantity: 0, ncGrossSalesPaise: 0 }],
      billSummaries: [{ billId: "bill-new", billNumber: 2, orderId: "order-new", tableName: "T2", status: "paid", totalPaise: 25_000, discountPaise: 0, tipPaise: 0, finalTotalPaise: 25_000, paidPaise: 25_000, settledAt: "2026-05-03T18:00:00.000Z", payments: [], items: [] }]
    });
    insertDailySnapshot(database, { id: "day-range-open", businessDate: "2026-05-04", billCount: 0, finalSalesPaise: 0, status: "active" });

    const summary = orderService.getRangeReport({ from: "2026-05-01", to: "2026-05-04", includeBills: true }) as {
      billCount: number;
      finalSalesPaise: number;
      cashPaymentsPaise: number;
      upiPaymentsPaise: number;
      cardPaymentsPaise: number;
      availableDays: Array<{ business_date: string }>;
      missingDates: string[];
      unfinalizedDates: string[];
      itemSummaries: Array<{ name: string; quantity: number; grossSalesPaise: number }>;
      groupSummaries: Array<{ saleGroupId: string; finalSalesPaise: number; taxPaise: number }>;
      billSummaries: Array<{ billId: string }>;
    };

    expect(summary).toMatchObject({
      billCount: 3,
      finalSalesPaise: 75_000,
      cashPaymentsPaise: 20_000,
      upiPaymentsPaise: 30_000,
      cardPaymentsPaise: 25_000,
      missingDates: ["2026-05-02"],
      unfinalizedDates: ["2026-05-04"]
    });
    expect(summary.availableDays.map((day) => day.business_date)).toEqual(["2026-05-01", "2026-05-03"]);
    expect(summary.itemSummaries).toEqual([expect.objectContaining({ name: "Dal Fry", quantity: 3, grossSalesPaise: 75_000 })]);
    expect(summary.groupSummaries).toEqual([expect.objectContaining({ saleGroupId: "sg-food", finalSalesPaise: 75_000, taxPaise: 3_750 })]);
    expect(summary.billSummaries.map((bill) => bill.billId)).toEqual(["bill-new", "bill-old"]);

    database.close();
  });
});
