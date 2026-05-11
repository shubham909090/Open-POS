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
        { menuItemId: "item-paneer-tikka", quantity: 2 },
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

  it("creates modified KOTs when more items are added to a table", () => {
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

    const result = orderService.submitOrder({
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
      { type: "modified", count: 2 },
      { type: "new", count: 2 }
    ]);
    const currentOrder = orderService.getOrder(result.orderId) as {
      items: Array<{ menu_item_id: string; quantity: number }>;
    };
    expect(currentOrder.items.map((item) => ({ menuItemId: item.menu_item_id, quantity: item.quantity })).sort((a, b) => a.menuItemId.localeCompare(b.menuItemId))).toEqual([
      { menuItemId: "item-lassi", quantity: 3 },
      { menuItemId: "item-paneer-tikka", quantity: 5 },
    ]);

    database.close();
  });

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
    expect(bill.totalPaise).toBe(21_000);

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

  it("supports manual split payments with discount and tip", () => {
    const { database, orderService } = createTestHub();

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });

    const bill = orderService.generateBill(order.orderId);
    const partPaid = orderService.settleBill(bill.billId, {
      receivedBy: "cashier-1",
      discountType: "amount",
      discountValue: 1000,
      tipPaise: 500,
      payments: [
        { method: "cash", amountPaise: 10000 },
        { method: "online", amountPaise: 5000, reference: "manual-upi-note" }
      ]
    });

    expect(partPaid.status).toBe("pending");
    expect(partPaid.remainingPaise).toBeGreaterThan(0);

    const final = orderService.settleBill(bill.billId, {
      receivedBy: "cashier-1",
      discountType: "amount",
      discountValue: 1000,
      tipPaise: 500,
      payments: [{ method: "card", amountPaise: partPaid.remainingPaise }]
    });

    expect(final.status).toBe("paid");
    expect(database.db.prepare("SELECT status, discount_paise, tip_paise FROM bills WHERE id = ?").get(bill.billId)).toEqual({
      status: "paid",
      discount_paise: 1000,
      tip_paise: 500
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM payments WHERE bill_id = ?").get(bill.billId)).toEqual({ count: 3 });

    database.close();
  });

  it("blocks day close while a generated bill is still unpaid", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    orderService.generateBill(order.orderId);

    expect(() => orderService.closePosDay({ closingCashPaise: 0, closedBy: "cashier-1" })).toThrow(
      "Cannot close POS day while orders are open or billed"
    );

    database.close();
  });

  it("only blocks day close for open orders in the current POS day", () => {
    const { database, orderService } = createTestHub();
    database.db
      .prepare(
        `INSERT INTO pos_days (id, outlet_id, business_date, status, opening_cash_paise, opened_by, opened_at)
         VALUES ('day-old', 'outlet-test', '2026-05-08', 'closed', 0, 'admin', '2026-05-08T00:00:00.000Z')`
      )
      .run();
    database.db
      .prepare(
        `INSERT INTO orders (id, table_id, pos_day_id, order_type, status, pax, captain_id, created_at, updated_at)
         VALUES ('order-old-open', 'table-t2', 'day-old', 'dine_in', 'open', 1, 'waiter-1', '2026-05-08T00:00:00.000Z', '2026-05-08T00:00:00.000Z')`
      )
      .run();

    expect(orderService.closePosDay({ closingCashPaise: 100_000, closedBy: "cashier-1" }).report).toMatchObject({
      openOrders: 0,
      billCount: 0
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
    orderService.updateFloor(floor.id, { name: "Terrace" });
    orderService.updateTable(table.id, { name: "R2" });
    orderService.updateProductionUnit(unit.id, { name: "Main Tandoor" });
    expect(database.db.prepare("SELECT name FROM floors WHERE id = ?").get(floor.id)).toEqual({ name: "Terrace" });
    expect(database.db.prepare("SELECT name FROM restaurant_tables WHERE id = ?").get(table.id)).toEqual({ name: "R2" });
    expect(database.db.prepare("SELECT name FROM production_units WHERE id = ?").get(unit.id)).toEqual({ name: "Main Tandoor" });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get()).toEqual({ count: 9 });

    database.close();
  });

  it("generates catalog IDs by default and protects advanced custom IDs", () => {
    const { database, orderService } = createTestHub();

    const floor = orderService.createFloor({ name: "Family Room" });
    const customFloor = orderService.createFloor({ name: "Garden", customId: "room-garden" });

    expect(floor.id).toMatch(/^floor_/);
    expect(customFloor.id).toBe("room-garden");
    expect(() => orderService.createFloor({ name: "Duplicate Garden", customId: "room-garden" })).toThrow(
      "That custom ID is already used. Choose another one."
    );

    database.close();
  });

  it("deletes unused setup records and disables used ones so they can be re-enabled", () => {
    const { database, orderService } = createTestHub();

    const floor = orderService.createFloor({ name: "Patio" });
    const table = orderService.createTable({ floorId: floor.id, name: "P1" });
    const unusedDish = orderService.createMenuItem({ name: "Papad", pricePaise: 4000 });

    expect(orderService.removeMenuItem(unusedDish.id)).toEqual({ id: unusedDish.id, deleted: true, active: false });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE id = ?").get(unusedDish.id)).toEqual({
      count: 0
    });

    orderService.removeTable(table.id);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM restaurant_tables WHERE id = ?").get(table.id)).toEqual({
      count: 0
    });

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    orderService.cancelOrder(order.orderId, "Test cleanup");

    expect(orderService.removeTable("table-t1")).toEqual({ id: "table-t1", deleted: false, active: false });
    expect(database.db.prepare("SELECT active FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({ active: 0 });
    orderService.updateTable("table-t1", { active: true });
    expect(database.db.prepare("SELECT active FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({ active: 1 });

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

  it("routes paid bill printing to the configured receipt printer", () => {
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
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "cashier-1" });
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
    const discountPaise = 1_000;
    const tipPaise = 500;
    const finalTotalPaise = bill.totalPaise - discountPaise + tipPaise;
    orderService.settleBill(bill.billId, {
      receivedBy: "cashier-1",
      discountType: "amount",
      discountValue: discountPaise,
      tipPaise,
      payments: [
        { method: "cash", amountPaise: 10_000 },
        { method: "upi", amountPaise: finalTotalPaise - 10_000 }
      ]
    });

    expect(orderService.getCloseSummary()).toMatchObject({
      openOrders: 0,
      unpaidBills: 0,
      paidBills: 1,
      openingCashPaise: 100_000,
      grossSalesPaise: bill.totalPaise,
      discountPaise,
      tipPaise,
      finalSalesPaise: finalTotalPaise,
      cashPaymentsPaise: 10_000,
      upiPaymentsPaise: finalTotalPaise - 10_000,
      totalPaymentsPaise: finalTotalPaise,
      expectedClosingCashPaise: 110_000
    });

    const closeResult = orderService.closePosDay({ closingCashPaise: 110_000, closedBy: "cashier-1" });
    expect(closeResult.report).toMatchObject({
      finalSalesPaise: finalTotalPaise,
      cashVariancePaise: 0,
      billCount: 1
    });
    expect(database.db.prepare("SELECT final_sales_paise, cash_variance_paise FROM daily_report_snapshots WHERE pos_day_id = ?").get(closeResult.id)).toEqual({
      final_sales_paise: finalTotalPaise,
      cash_variance_paise: 0
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE type = 'daily_report.finalized'").get()).toEqual({
      count: 1
    });

    database.close();
  });
});
