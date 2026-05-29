import { describe, expect, it, vi } from "vitest";
import { stripPrintStyleMarkers } from "../domain/tickets.js";
import { createTestHub } from "./helpers.js";

describe("OrderService bill history edits", () => {
  it("edits paid history bills with master PIN, auto-matches payment, tags modified, and prints full updated bill", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });

    expect(() =>
      orderService.editHistoryBill(bill.billId, {
        items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
        masterApproval: { pin: "1234", reason: "Owner history edit", approvedBy: "owner" }
      })
    ).toThrow("Master PIN is incorrect");

    const edited = orderService.editHistoryBill(bill.billId, {
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
      discountType: "amount",
      discountValue: 5000,
      payments: [
        { method: "upi", amountPaise: 20_000, reference: "UPI-edited" },
        { method: "card", amountPaise: 11_000, reference: "UPI-edited" }
      ],
      masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
    });

    expect(edited).toMatchObject({ billId: bill.billId, revisionNumber: 2, totalPaise: 36_000, printJobId: expect.any(String), modified: true });
    expect(database.db.prepare("SELECT status, total_paise, discount_paise, final_total_paise, revision_number FROM bills WHERE id = ?").get(bill.billId)).toEqual({
      status: "paid",
      total_paise: 36_000,
      discount_paise: 5_000,
      final_total_paise: 31_000,
      revision_number: 2
    });
    expect(database.db.prepare("SELECT method, amount_paise, reference FROM payments WHERE bill_id = ? ORDER BY method").all(bill.billId)).toEqual([
      { method: "card", amount_paise: 11_000, reference: "UPI-edited" },
      { method: "upi", amount_paise: 20_000, reference: "UPI-edited" }
    ]);
    const summary = orderService.getCurrentBusinessDaySummary() as {
      finalSalesPaise: number;
      upiPaymentsPaise: number;
      cardPaymentsPaise: number;
      billSummaries?: Array<{ finalTotalPaise: number; paidPaise: number; revisionNumber: number; modified: boolean; payments: Array<{ method: string; amountPaise: number; reference: string | null }> }>;
    };
    expect(summary.finalSalesPaise).toBe(31_000);
    expect(summary.upiPaymentsPaise).toBe(20_000);
    expect(summary.cardPaymentsPaise).toBe(11_000);
    expect(summary.billSummaries?.[0]).toMatchObject({
      finalTotalPaise: 31_000,
      paidPaise: 31_000,
      revisionNumber: 2,
      modified: true,
      payments: [
        { method: "upi", amountPaise: 20_000, reference: "UPI-edited" },
        { method: "card", amountPaise: 11_000, reference: "UPI-edited" }
      ]
    });
    const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE id = ?").get(edited.printJobId) as { payload: string };
    expect(printJob.payload).toContain("Dal Fry");
    expect(printJob.payload).toContain("360.00");
    expect(stripPrintStyleMarkers(printJob.payload)).toContain("Discount              -50.00");
    expect(printJob.payload).toContain("Modified");
    expect(printJob.payload).not.toContain("REPRINT");

    database.close();
  });

  it("keeps the original bill date when a history edit prints the modified bill", () => {
    vi.useFakeTimers();
    const hub = createTestHub();
    const { database, orderService } = hub;
    try {
      orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
      vi.setSystemTime(new Date("2026-05-08T12:00:00.000Z"));
      const order = orderService.submitOrder({
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 1,
        orderType: "dine_in",
        printMode: "kot",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      });
      const bill = orderService.generateBill(order.orderId);
      orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });

      vi.setSystemTime(new Date("2026-05-29T12:00:00.000Z"));
      const edited = orderService.editHistoryBill(bill.billId, {
        items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
        payments: [{ method: "cash", amountPaise: 36_000 }],
        masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
      });

      const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE id = ?").get(edited.printJobId) as { payload: string };
      const payload = stripPrintStyleMarkers(printJob.payload);
      expect(payload).toContain("Date: 8 May 2026");
      expect(payload).not.toContain("Date: 29 May 2026");
    } finally {
      database.close();
      vi.useRealTimers();
    }
  });

  it("rejects pending history edits so active billed orders stay on the table editor flow", () => {
    const { database, orderService } = createTestHub();
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    const orderItem = database.db.prepare("SELECT id, quantity FROM order_items WHERE order_id = ?").get(order.orderId) as { id: string; quantity: number };

    expect(() =>
      orderService.editHistoryBill(bill.billId, {
        items: [{ orderItemId: orderItem.id, menuItemId: "item-dal-fry", quantity: 2 }],
        masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
      })
    ).toThrow("Only paid or NC bills can be edited from Order History");

    expect(database.db.prepare("SELECT quantity FROM order_items WHERE id = ?").get(orderItem.id)).toEqual({ quantity: 1 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs WHERE target_id = ? AND target_type = 'BILL'").get(bill.billId)).toEqual({ count: 1 });

    database.close();
  });

  it("allows NC history bills to be edited with the master PIN", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.markBillNc(bill.billId, {
      managerApproval: { pin: "1234", reason: "Owner tasting", approvedBy: "manager" }
    });

    const edited = orderService.editHistoryBill(bill.billId, {
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
      masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
    });

    expect(edited).toMatchObject({ billId: bill.billId, revisionNumber: 2, totalPaise: 36_000, modified: true });
    expect(database.db.prepare("SELECT status, is_nc, total_paise, revision_number FROM bills WHERE id = ?").get(bill.billId)).toEqual({
      status: "paid",
      is_nc: 1,
      total_paise: 36_000,
      revision_number: 2
    });

    database.close();
  });

  it("replaces paid bill payment split exactly when a history edit changes the total", () => {
    const { database, orderService } = createTestHub();
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      payments: [
        { method: "cash", amountPaise: 10_000 },
        { method: "upi", amountPaise: 8_000, reference: "UPI-1" }
      ]
    });

    orderService.editHistoryBill(bill.billId, {
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
      payments: [
        { method: "upi", amountPaise: 20_000, reference: "UPI-2" },
        { method: "card", amountPaise: 16_000, reference: "UPI-2" }
      ],
      masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
    });

    const summary = orderService.getCurrentBusinessDaySummary() as {
      cashPaymentsPaise: number;
      upiPaymentsPaise: number;
      cardPaymentsPaise: number;
      billSummaries?: Array<{ paidPaise: number; payments: Array<{ method: string; amountPaise: number; reference: string | null }> }>;
    };
    expect(summary.cashPaymentsPaise).toBe(0);
    expect(summary.upiPaymentsPaise).toBe(20_000);
    expect(summary.cardPaymentsPaise).toBe(16_000);
    expect(summary.billSummaries?.[0]?.paidPaise).toBe(36_000);
    expect([...(summary.billSummaries?.[0]?.payments ?? [])].sort((a, b) => a.method.localeCompare(b.method))).toEqual([
      { method: "card", amountPaise: 16_000, reference: "UPI-2" },
      { method: "upi", amountPaise: 20_000, reference: "UPI-2" }
    ]);

    database.close();
  });

  it("queues cloud backup tombstones for replaced history payments", () => {
    const { database, orderService } = createTestHub();
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      payments: [
        { method: "cash", amountPaise: 10_000 },
        { method: "upi", amountPaise: 8_000, reference: "UPI-1" }
      ]
    });
    const oldPayments = database.db.prepare("SELECT id FROM payments WHERE bill_id = ? ORDER BY id").all(bill.billId) as Array<{ id: string }>;

    orderService.editHistoryBill(bill.billId, {
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
      payments: [
        { method: "upi", amountPaise: 20_000, reference: "UPI-2" },
        { method: "card", amountPaise: 16_000, reference: "UPI-2" }
      ],
      masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
    });

    expect(database.db.prepare("SELECT domain, local_id, pushed_at FROM cloud_backup_tombstones ORDER BY local_id").all()).toEqual(
      oldPayments.map((payment) => ({
        domain: "payments",
        local_id: payment.id,
        pushed_at: null
      }))
    );

    database.close();
  });

  it("rejects paid history payment edits when the split is not exact", () => {
    const { database, orderService } = createTestHub();
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      payments: [{ method: "cash", amountPaise: bill.totalPaise }]
    });

    expect(() =>
      orderService.editHistoryBill(bill.billId, {
        items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
        payments: [{ method: "upi", amountPaise: 35_900 }],
        masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
      })
    ).toThrow("History edit payments must exactly match the edited bill total");
    expect(() =>
      orderService.editHistoryBill(bill.billId, {
        items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
        payments: [{ method: "upi", amountPaise: 36_100 }],
        masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
      })
    ).toThrow("History edit payments must exactly match the edited bill total");
    expect(database.db.prepare("SELECT method, amount_paise FROM payments WHERE bill_id = ?").get(bill.billId)).toEqual({
      method: "cash",
      amount_paise: bill.totalPaise
    });

    database.close();
  });

  it("updates finalized order history snapshots when an old paid bill is edited", () => {
    const { database, orderService } = createTestHub();
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });
    const day = database.db.prepare("SELECT pos_day_id FROM orders WHERE id = ?").get(order.orderId) as { pos_day_id: string };
    database.db
      .prepare(
        `UPDATE pos_days
         SET business_date = '2026-05-08',
             period_start_at = '2026-05-07T00:30:00.000Z',
             period_end_at = '2026-05-08T00:30:00.000Z'
         WHERE id = ?`
      )
      .run(day.pos_day_id);

    expect(orderService.listDailyReports()).toMatchObject([{ final_sales_paise: 18_000 }]);

    orderService.editHistoryBill(bill.billId, {
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
      payments: [{ method: "cash", amountPaise: 36_000 }],
      masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
    });
    const detail = orderService.getDailyReport(day.pos_day_id) as {
      final_sales_paise: number;
      billSummaries: Array<{ finalTotalPaise: number; paidPaise: number; modified: boolean; items: Array<{ quantity: number }> }>;
    };

    expect(detail.final_sales_paise).toBe(36_000);
    expect(detail.billSummaries[0]).toMatchObject({ finalTotalPaise: 36_000, paidPaise: 36_000, modified: true });
    expect(detail.billSummaries[0]?.items[0]).toMatchObject({ quantity: 2 });

    database.close();
  });
});
