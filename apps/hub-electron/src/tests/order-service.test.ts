import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService KOT lifecycle", () => {
  it("creates an order, KOT, print job, event, and sync outbox in one transaction", () => {
    const { database, orderService } = createTestHub();

    const result = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 2,
      orderType: "dine_in",
      items: [
        { menuItemId: "item-paneer-tikka", quantity: 2, notes: "less spicy" },
        { menuItemId: "item-lassi", quantity: 1 }
      ]
    });

    expect(result.kotIds).toHaveLength(2);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM kots WHERE type = 'new'").get()).toEqual({ count: 2 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs WHERE status = 'pending'").get()).toEqual({
      count: 2
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending'").get()).toEqual({
      count: 4
    });
    expect(database.db.prepare("SELECT status FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({
      status: "occupied"
    });

    database.close();
  });

  it("creates modified and partial-cancel KOTs when quantities change", () => {
    const { database, orderService } = createTestHub();

    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 2,
      orderType: "dine_in",
      items: [
        { menuItemId: "item-paneer-tikka", quantity: 2 },
        { menuItemId: "item-lassi", quantity: 2 }
      ]
    });

    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 2,
      orderType: "dine_in",
      items: [
        { menuItemId: "item-paneer-tikka", quantity: 3 },
        { menuItemId: "item-lassi", quantity: 1 }
      ]
    });

    const rows = database.db.prepare("SELECT type, COUNT(*) AS count FROM kots GROUP BY type ORDER BY type").all();
    expect(rows).toEqual([
      { type: "modified", count: 1 },
      { type: "new", count: 2 },
      { type: "partial_cancel", count: 1 }
    ]);

    database.close();
  });

  it("creates cancelled KOTs and frees the table when an order is cancelled", () => {
    const { database, orderService } = createTestHub();

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-paneer-tikka", quantity: 1 }]
    });

    const cancelled = orderService.cancelOrder(order.orderId, "Guest left");

    expect(cancelled.kotIds).toHaveLength(1);
    expect(database.db.prepare("SELECT type FROM kots ORDER BY sequence DESC LIMIT 1").get()).toEqual({
      type: "cancelled"
    });
    expect(database.db.prepare("SELECT status, current_order_id FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({
      status: "free",
      current_order_id: null
    });

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
      receivedBy: "cashier-1"
    });

    expect(database.db.prepare("SELECT status FROM bills WHERE id = ?").get(bill.billId)).toEqual({ status: "paid" });
    expect(database.db.prepare("SELECT status FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({
      status: "free"
    });

    database.close();
  });

  it("manages catalog records and records sync events", () => {
    const { database, orderService } = createTestHub();

    const floor = orderService.createFloor({ name: "Rooftop" });
    const table = orderService.createTable({ floorId: floor.id, name: "R1" });
    const unit = orderService.createProductionUnit({
      name: "Tandoor",
      printerMode: "network",
      printerHost: "192.168.1.61",
      printerPort: 9100,
      kdsEnabled: true
    });
    const menuItem = orderService.createMenuItem({
      name: "Butter Naan",
      pricePaise: 6000,
      productionUnitId: unit.id,
      active: true
    });

    expect(table.id).toMatch(/^table_/);
    expect(menuItem.id).toMatch(/^menu_/);
    orderService.updateMenuItem(menuItem.id, { name: "Garlic Naan", pricePaise: 7000, active: false });
    expect(database.db.prepare("SELECT name, price_paise, active FROM menu_items WHERE id = ?").get(menuItem.id)).toEqual({
      name: "Garlic Naan",
      price_paise: 7000,
      active: 0
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get()).toEqual({ count: 6 });

    database.close();
  });

  it("updates KDS status and allows print job retry", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const kot = database.db.prepare("SELECT id FROM kots WHERE order_id = ? LIMIT 1").get(order.orderId) as { id: string };
    const print = database.db.prepare("SELECT id FROM print_jobs WHERE target_id = ? LIMIT 1").get(kot.id) as { id: string };

    orderService.updateKotStatus(kot.id, { status: "preparing" });
    database.db.prepare("UPDATE print_jobs SET status = 'failed', last_error = 'paper out' WHERE id = ?").run(print.id);
    orderService.retryPrintJob(print.id, { requestedBy: "cashier-1" });

    expect(database.db.prepare("SELECT status FROM kots WHERE id = ?").get(kot.id)).toEqual({ status: "preparing" });
    expect(database.db.prepare("SELECT status, last_error FROM print_jobs WHERE id = ?").get(print.id)).toEqual({
      status: "pending",
      last_error: null
    });

    database.close();
  });

  it("routes bill printing to the configured receipt printer", () => {
    const { database, orderService } = createTestHub();
    orderService.updateReceiptPrinter({
      printerMode: "network",
      printerHost: "192.168.1.70",
      printerPort: 9100
    });

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    const bill = orderService.generateBill(order.orderId);
    expect(database.db.prepare("SELECT printer_host, printer_port FROM print_jobs WHERE target_id = ?").get(bill.billId)).toEqual({
      printer_host: "192.168.1.70",
      printer_port: 9100
    });

    database.close();
  });

  it("returns cash reconciliation details for day close", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "cashier-1" });

    expect(orderService.getCloseSummary()).toMatchObject({
      openOrders: 0,
      unpaidBills: 0,
      cashPaymentsPaise: bill.totalPaise
    });

    database.close();
  });
});
