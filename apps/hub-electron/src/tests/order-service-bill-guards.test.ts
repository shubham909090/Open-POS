import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService bill guard rules", () => {
  it("blocks NC marking after a normal payment has been recorded", () => {
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
    orderService.settleBill(bill.billId, {
      discountType: "amount",
      discountValue: 0,
      tipPaise: 0,
      payments: [{ method: "cash", amountPaise: 100 }],
      receivedBy: "captain"
    });

    expect(() =>
      orderService.markBillNc(bill.billId, {
        managerApproval: { pin: "1234", reason: "Too late", approvedBy: "manager" }
      })
    ).toThrow("Remove or reverse recorded payments before marking this bill NC");

    database.close();
  });

  it("blocks bill revision after partial payment has been recorded", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, {
      discountType: "amount",
      discountValue: 0,
      tipPaise: 0,
      payments: [{ method: "cash", amountPaise: 100 }],
      receivedBy: "captain"
    });

    expect(() =>
      orderService.reviseBill(bill.billId, {
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }],
        managerApproval: { pin: "1234", reason: "After payment", approvedBy: "manager" }
      })
    ).toThrow("Remove or reverse recorded payments before revising this bill");

    database.close();
  });

  it("preserves printed bill line prices when revising after a catalog price change", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const dish = orderService.createMenuItem({ name: "Revision Price Dish", pricePaise: 10_000, active: true });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: dish.id, quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    const orderItem = database.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(order.orderId) as { id: string };

    orderService.updateMenuItem(dish.id, { pricePaise: 15_000 });
    const revised = orderService.reviseBill(bill.billId, {
      items: [{ orderItemId: orderItem.id, menuItemId: dish.id, quantity: 1 }],
      managerApproval: { pin: "1234", reason: "Quantity checked", approvedBy: "manager" }
    });

    expect(revised.totalPaise).toBe(10_000);
    expect(database.db.prepare("SELECT quantity, unit_price_paise, status FROM order_items WHERE id = ?").get(orderItem.id)).toEqual({
      quantity: 1,
      unit_price_paise: 10_000,
      status: "active"
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_id = ?").get(order.orderId)).toEqual({ count: 1 });
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: revised.totalPaise, receivedBy: "captain-1" });
    const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE target_id = ? AND target_type = 'BILL'").get(bill.billId) as { payload: string };
    expect(printJob.payload).toContain("Revision Price");
    expect(printJob.payload).toContain("Dish");
    expect(printJob.payload).toContain("100.00");
    expect(printJob.payload).not.toContain("150.00");
    expect(printJob.payload).not.toContain("₹");

    database.close();
  });
});
