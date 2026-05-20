import { describe, expect, it } from "vitest";
import { stripPrintStyleMarkers } from "../domain/tickets.js";
import { createTestHub, insertDailySnapshot } from "./helpers.js";

describe("OrderService report groups and NC summaries", () => {
  it("omits bill summaries from range reports until requested and rejects future-only ranges", () => {
    const { database, orderService } = createTestHub();
    insertDailySnapshot(database, { id: "day-range-no-bills", businessDate: "2026-05-01", billCount: 1, finalSalesPaise: 10_000, cashPaise: 10_000 });

    const summary = orderService.getRangeReport({ from: "2026-05-01", to: "2026-05-01", includeBills: false }) as { billSummaries?: unknown[] };

    expect(summary.billSummaries).toBeUndefined();
    expect(() => orderService.getRangeReport({ from: "2999-01-01", to: "2999-01-02", includeBills: false })).toThrow("Report range starts after the current business day");

    database.close();
  });

  it("finalizes an old business day when the last blocker is marked NC", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
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

    orderService.markBillNc(bill.billId, {
      managerApproval: { pin: "1234", reason: "Staff meal", approvedBy: "manager" }
    });

    expect(database.db.prepare("SELECT COUNT(*) AS count FROM daily_report_snapshots WHERE pos_day_id = ?").get(dayId.pos_day_id)).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE type = 'daily_report.finalized'").get()).toEqual({ count: 1 });

    database.close();
  });

  it("supports sale groups, open bar items, BOT routing, NC bills, and group reports", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ openName: "Open Bar", openPricePaise: 10_000, saleGroupId: "sg-alcohol", productionUnitId: "unit-bar", quantity: 2 }]
    });

    expect(database.db.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE active = 0").get()).toEqual({ count: 0 });
    expect(database.db.prepare("SELECT menu_item_id, is_open_item FROM order_items WHERE order_id = ?").get(order.orderId)).toEqual({
      menu_item_id: null,
      is_open_item: 1
    });
    expect(database.db.prepare("SELECT target_type FROM print_jobs ORDER BY created_at DESC LIMIT 1").get()).toEqual({ target_type: "BOT" });
    const bill = orderService.generateBill(order.orderId);
    expect(bill.totalPaise).toBe(20_000);
    const ncBill = orderService.markBillNc(bill.billId, {
      discountType: "amount",
      discountValue: 5_000,
      managerApproval: { pin: "1234", reason: "Owner tasting", approvedBy: "manager" }
    });
    const ncPrintJob = database.db.prepare("SELECT payload FROM print_jobs WHERE id = ?").get(ncBill.printJobId) as { payload: string };
    expect(ncPrintJob.payload).toContain("Item");
    expect(ncPrintJob.payload).toContain("Open Bar");
    expect(ncPrintJob.payload).toContain("2");
    expect(ncPrintJob.payload).toContain("200.00");
    expect(stripPrintStyleMarkers(ncPrintJob.payload)).toContain("Discount              -50.00");
    expect(ncPrintJob.payload).not.toContain("VAT");
    expect(ncPrintJob.payload).not.toContain("₹");
    expect(ncPrintJob.payload).toContain("NC Reason: Owner tasting");

    const summary = orderService.getCurrentBusinessDaySummary() as {
      finalSalesPaise: number;
      groupSummaries: Array<{ kind: string; ncQuantity: number; ncGrossSalesPaise: number; finalSalesPaise: number }>;
    };
    expect(summary.finalSalesPaise).toBe(0);
    expect(summary.groupSummaries).toContainEqual(
      expect.objectContaining({ kind: "alcohol", ncQuantity: 2, ncGrossSalesPaise: 20_000, finalSalesPaise: 0 })
    );

    database.close();
  });

  it("allocates discounts and tips into group report totals", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [
        { menuItemId: "item-dal-fry", quantity: 1 },
        { openName: "Open Bar", openPricePaise: 10_000, saleGroupId: "sg-alcohol", productionUnitId: "unit-bar", quantity: 1 }
      ]
    });
    const bill = orderService.generateBill(order.orderId);
    const discountPaise = 1_000;
    const tipPaise = 500;
    const finalTotalPaise = bill.totalPaise - discountPaise + tipPaise;
    orderService.settleBill(bill.billId, {
      receivedBy: "captain",
      discountType: "amount",
      discountValue: discountPaise,
      tipPaise,
      payments: [{ method: "cash", amountPaise: finalTotalPaise }]
    });

    const summary = orderService.getCurrentBusinessDaySummary() as {
      finalSalesPaise: number;
      groupSummaries: Array<{ kind: string; finalSalesPaise: number }>;
    };
    expect(summary.groupSummaries.map((group) => group.kind).sort()).toEqual(["alcohol", "food"]);
    expect(summary.groupSummaries.reduce((total, group) => total + group.finalSalesPaise, 0)).toBe(summary.finalSalesPaise);

    database.close();
  });
});
