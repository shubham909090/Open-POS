import { describe, expect, it } from "vitest";
import { stripPrintStyleMarkers } from "../domain/tickets.js";
import { createTestHub } from "./helpers.js";

describe("OrderService bill lifecycle", () => {
  it("allows dishes without a kitchen to be billed without creating a KOT", () => {
    const { database, orderService } = createTestHub();
    const dish = orderService.createMenuItem({ name: "Curd Rice", pricePaise: 10_000, active: true });

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: dish.id, quantity: 2 }]
    });

    expect(order.kotIds).toHaveLength(0);
    expect(database.db.prepare("SELECT unit_price_paise, production_unit_id FROM order_items WHERE menu_item_id = ?").get(dish.id)).toEqual({
      unit_price_paise: 10_000,
      production_unit_id: null
    });

    const bill = orderService.generateBill(order.orderId);
    expect(bill.totalPaise).toBe(20_000);

    database.close();
  });

  it("stores generated bill tax breakup with readable names, rates, and amounts", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    const bill = orderService.generateBill(order.orderId);
    const row = database.db.prepare("SELECT subtotal_paise, tax_paise, total_paise, tax_breakdown_json FROM bills WHERE id = ?").get(bill.billId) as {
      subtotal_paise: number;
      tax_paise: number;
      total_paise: number;
      tax_breakdown_json: string;
    };

    expect(row.subtotal_paise).toBe(18_000);
    expect(row.tax_paise).toBe(900);
    expect(row.total_paise).toBe(18_000);
    expect(JSON.parse(row.tax_breakdown_json)).toEqual([
      { name: "Food CGST", rateBps: 250, amountPaise: 450 },
      { name: "Food SGST", rateBps: 250, amountPaise: 450 }
    ]);

    database.close();
  });

  it("generates a sequential bill number and queues the first customer bill print", () => {
    const { database, orderService } = createTestHub();

    const firstOrder = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const firstBill = orderService.generateBill(firstOrder.orderId);

    orderService.settleBill(firstBill.billId, { method: "cash", amountPaise: firstBill.totalPaise, receivedBy: "captain-1" });
    const secondOrder = orderService.submitOrder({
      tableId: "table-t2",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-lassi", quantity: 1 }]
    });
    const secondBill = orderService.generateBill(secondOrder.orderId);

    expect(firstBill).toMatchObject({ billNumber: 1, printJobId: expect.any(String) });
    expect(secondBill).toMatchObject({ billNumber: 2, printJobId: expect.any(String) });
    expect(database.db.prepare("SELECT bill_number, print_count FROM bills ORDER BY bill_number").all()).toEqual([
      { bill_number: 1, print_count: 1 },
      { bill_number: 2, print_count: 1 }
    ]);
    const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE id = ?").get(firstBill.printJobId) as { payload: string };
    expect(printJob.payload).toContain("BILL 1");
    expect(printJob.payload).not.toContain(firstBill.billId);

    database.close();
  });

  it("prints one compact GST pair for non-alcohol bill categories", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [
        { menuItemId: "item-dal-fry", quantity: 1 },
        { menuItemId: "item-lassi", quantity: 1 }
      ]
    });
    const bill = orderService.generateBill(order.orderId);
    const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE target_id = ?").get(bill.billId) as { payload: string };

    const plainPayload = stripPrintStyleMarkers(printJob.payload);
    expect(plainPayload.match(/CGST @ 2\.5%/g)).toHaveLength(1);
    expect(plainPayload.match(/SGST @ 2\.5%/g)).toHaveLength(1);
    expect(plainPayload).toContain("CGST @ 2.5%: 6.75");
    expect(plainPayload).toContain("SGST @ 2.5%: 6.75");
    expect(plainPayload).not.toContain("Food CGST");
    expect(plainPayload).not.toContain("Beverage SGST");

    database.close();
  });

  it("removes the local pending bill instead of saving a zero bill when all billed items are removed", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);

    const result = orderService.updateOrderState(order.orderId, {
      saveMode: "save",
      items: [],
      managerApproval: { pin: "1234", reason: "Remove billed table items", approvedBy: "manager" }
    });

    expect(result).toMatchObject({ orderId: order.orderId, status: "cancelled", totalPaise: 0 });
    expect(result.billId).toBeUndefined();
    expect(result.revisionNumber).toBeUndefined();
    expect(database.db.prepare("SELECT status FROM orders WHERE id = ?").get(order.orderId)).toEqual({ status: "cancelled" });
    expect(database.db.prepare("SELECT status, current_order_id FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({ status: "free", current_order_id: null });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM bills WHERE id = ?").get(bill.billId)).toEqual({ count: 0 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM bills WHERE final_total_paise = 0").get()).toEqual({ count: 0 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM bill_revisions WHERE bill_id = ?").get(bill.billId)).toEqual({ count: 0 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs WHERE target_type = 'BILL' AND target_id = ?").get(bill.billId)).toEqual({ count: 0 });

    database.close();
  });

  it("cleans existing empty pending bills from local state before they show in summaries", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);

    database.db.prepare("UPDATE order_items SET quantity = 0, status = 'cancelled' WHERE order_id = ?").run(order.orderId);
    database.db
      .prepare("UPDATE bills SET subtotal_paise = 0, tax_paise = 0, total_paise = 0, final_total_paise = 0, status = 'pending' WHERE id = ?")
      .run(bill.billId);

    orderService.bootstrap();

    expect(database.db.prepare("SELECT COUNT(*) AS count FROM bills WHERE id = ?").get(bill.billId)).toEqual({ count: 0 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM bills WHERE final_total_paise = 0").get()).toEqual({ count: 0 });
    expect(database.db.prepare("SELECT status FROM orders WHERE id = ?").get(order.orderId)).toEqual({ status: "cancelled" });
    expect(database.db.prepare("SELECT status, current_order_id FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({ status: "free", current_order_id: null });
    expect(orderService.getCurrentBusinessDaySummary()).toMatchObject({ unpaidBills: 0 });

    database.close();
  });

  it("blocks removing all billed items when payments are already recorded", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
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
      method: "cash",
      amountPaise: Math.floor(bill.totalPaise / 2),
      receivedBy: "captain-1"
    });

    expect(() =>
      orderService.updateOrderState(order.orderId, {
        saveMode: "save",
        items: [],
        managerApproval: { pin: "1234", reason: "Remove billed table items", approvedBy: "manager" }
      })
    ).toThrow("Remove or reverse recorded payments before removing all billed items");
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM bills WHERE id = ?").get(bill.billId)).toEqual({ count: 1 });

    database.close();
  });

  it("generates and settles a cash bill", () => {
    const { database, orderService } = createTestHub();

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });

    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, {
      method: "cash",
      amountPaise: bill.totalPaise,
      receivedBy: "captain-1"
    });

    expect(database.db.prepare("SELECT status FROM bills WHERE id = ?").get(bill.billId)).toEqual({ status: "paid" });
    expect(database.db.prepare("SELECT status FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({
      status: "free"
    });

    database.close();
  });
});
