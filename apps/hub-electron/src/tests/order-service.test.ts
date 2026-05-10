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

  it("applies menu modifiers and note templates into order, KOT, and bill math", () => {
    const { database, orderService } = createTestHub();
    const group = orderService.createModifierGroup({
      name: "Add-on",
      selectionType: "multiple",
      minSelections: 0,
      maxSelections: 3,
      active: true
    });
    const option = orderService.createModifierOption({
      groupId: group.id,
      name: "Extra Malai",
      priceDeltaPaise: 5_000,
      active: true
    });
    orderService.assignModifierGroup({ menuItemId: "item-lassi", groupId: group.id });

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [
        {
          menuItemId: "item-lassi",
          quantity: 2,
          notes: "chilled",
          modifiers: [{ groupId: group.id, optionId: option.id }]
        }
      ]
    });

    expect(database.db.prepare("SELECT unit_price_paise, modifier_total_paise, notes FROM order_items").get()).toEqual({
      unit_price_paise: 14_000,
      modifier_total_paise: 5_000,
      notes: "Add-on: Extra Malai | chilled"
    });
    expect(database.db.prepare("SELECT notes FROM kot_items").get()).toEqual({ notes: "Add-on: Extra Malai | chilled" });

    const bill = orderService.generateBill(order.orderId);
    expect(bill.totalPaise).toBe(29_400);

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
      discountPaise: 1000,
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
      discountPaise: 1000,
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
    const discountPaise = 1_000;
    const tipPaise = 500;
    const finalTotalPaise = bill.totalPaise - discountPaise + tipPaise;
    orderService.settleBill(bill.billId, {
      receivedBy: "cashier-1",
      discountPaise,
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

    database.close();
  });
});
