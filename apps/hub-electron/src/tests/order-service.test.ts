import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService KOT lifecycle", () => {
  it("defaults printer output to test mode and persists explicit mode changes", () => {
    const { database, orderService } = createTestHub();

    expect(orderService.getPrinterOutputMode()).toBe("test");
    expect(orderService.ensurePrinterOutputMode("live")).toBe("live");
    expect(orderService.getPrinterOutputMode()).toBe("live");
    expect(orderService.updatePrinterOutputMode("test")).toEqual({ mode: "test" });
    expect(database.db.prepare("SELECT value FROM hub_settings WHERE key = 'printer_output_mode'").get()).toEqual({ value: "test" });

    database.close();
  });

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

  it("keeps separate order rows when a menu item price changes before adding it again", () => {
    const { database, orderService } = createTestHub();
    const dish = orderService.createMenuItem({ name: "Price Snapshot Dish", pricePaise: 10_000, active: true });

    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: dish.id, quantity: 1 }]
    });
    orderService.updateMenuItem(dish.id, { pricePaise: 15_000 });
    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: dish.id, quantity: 1 }]
    });

    expect(
      database.db.prepare("SELECT quantity, unit_price_paise FROM order_items WHERE menu_item_id = ? ORDER BY unit_price_paise").all(dish.id)
    ).toEqual([
      { quantity: 1, unit_price_paise: 10_000 },
      { quantity: 1, unit_price_paise: 15_000 }
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

    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const cancelled = orderService.cancelOrder(order.orderId, {
      reason: "Guest left",
      requestedBy: "captain-1",
      managerApproval: { pin: "1234", reason: "Guest left", approvedBy: "manager" }
    });

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
      receivedBy: "captain-1"
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
      receivedBy: "captain-1",
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
      receivedBy: "captain-1",
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

  it("allows explicit zero to clear bill discount and tip during settlement", () => {
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
      receivedBy: "captain-1",
      discountType: "amount",
      discountValue: 1000,
      tipPaise: 500,
      payments: [{ method: "cash", amountPaise: 1000 }]
    });
    const final = orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      discountType: "amount",
      discountValue: 0,
      tipPaise: 0,
      payments: [{ method: "card", amountPaise: bill.totalPaise - 1000 }]
    });

    expect(final.status).toBe("paid");
    expect(database.db.prepare("SELECT discount_paise, tip_paise, final_total_paise FROM bills WHERE id = ?").get(bill.billId)).toEqual({
      discount_paise: 0,
      tip_paise: 0,
      final_total_paise: bill.totalPaise
    });

    database.close();
  });

  it("rejects overpayment instead of silently recording extra money", () => {
    const { database, orderService } = createTestHub();

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);

    expect(() =>
      orderService.settleBill(bill.billId, {
        receivedBy: "captain-1",
        payments: [{ method: "cash", amountPaise: bill.totalPaise + 1 }]
      })
    ).toThrow("Payment exceeds the balance due");
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM payments WHERE bill_id = ?").get(bill.billId)).toEqual({ count: 0 });

    database.close();
  });

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
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get()).toEqual({ count: 8 });

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
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    orderService.cancelOrder(order.orderId, {
      reason: "Test cleanup",
      requestedBy: "captain-1",
      managerApproval: { pin: "1234", reason: "Test cleanup", approvedBy: "manager" }
    });

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
    orderService.retryPrintJob(print.id, { requestedBy: "captain-1" });

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
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });
    expect(database.db.prepare("SELECT printer_host, printer_port FROM print_jobs WHERE target_id = ?").get(bill.billId)).toEqual({
      printer_host: "192.168.1.70",
      printer_port: 9100
    });

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
    expect(bill.totalPaise).toBe(22_000);
    orderService.markBillNc(bill.billId, {
      managerApproval: { pin: "1234", reason: "Owner tasting", approvedBy: "manager" }
    });

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

    expect(revised.totalPaise).toBe(10_500);
    expect(database.db.prepare("SELECT quantity, unit_price_paise, status FROM order_items WHERE id = ?").get(orderItem.id)).toEqual({
      quantity: 1,
      unit_price_paise: 10_000,
      status: "active"
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_id = ?").get(order.orderId)).toEqual({ count: 1 });

    database.close();
  });

  it("tracks plain-liquor variants as pending until payment and deducts stock on settlement", () => {
    const { database, orderService } = createTestHub();
    const liquor = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Test Whisky",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 2,
      openLargeMl: 0,
      sealedSmallCount: 1,
      variants: [
        { label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true },
        { label: "180 ml", kind: "small_bottle", pricePaise: 50_000, volumeMl: 180, inventoryAction: "small_bottle", sortOrder: 1, active: true },
        { label: "750 ml", kind: "large_bottle", pricePaise: 180_000, volumeMl: 750, inventoryAction: "large_bottle", sortOrder: 2, active: true }
      ],
      recipeIngredients: []
    });
    const variants = database.db.prepare("SELECT id, kind FROM menu_item_variants WHERE menu_item_id = ?").all(liquor.id) as Array<{ id: string; kind: string }>;
    const variantId = (kind: string) => variants.find((variant) => variant.kind === kind)?.id as string;

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [
        { menuItemId: liquor.id, menuItemVariantId: variantId("shot"), quantity: 2 },
        { menuItemId: liquor.id, menuItemVariantId: variantId("small_bottle"), quantity: 1 },
        { menuItemId: liquor.id, menuItemVariantId: variantId("large_bottle"), quantity: 1 }
      ]
    });
    const pending = orderService.listAlcoholStorage() as Array<{ id: string; pending_total_ml: number; total_available_ml: number }>;
    expect(pending.find((row) => row.id === liquor.id)).toMatchObject({ pending_total_ml: 990, total_available_ml: 1680 });

    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });

    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml, sealed_small_count FROM alcohol_stock_levels WHERE menu_item_id = ?").get(liquor.id)).toEqual({
      sealed_large_count: 0,
      open_large_ml: 690,
      sealed_small_count: 0
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM alcohol_stock_movements WHERE source_id = ?").get(bill.billId)).toEqual({ count: 3 });

    database.close();
  });

  it("blocks alcohol settlement that would make stock negative", () => {
    const { database, orderService } = createTestHub();
    const vodka = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Test Vodka",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 1,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const rum = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Test Rum",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "750 ml", kind: "large_bottle", pricePaise: 150_000, volumeMl: 750, inventoryAction: "large_bottle", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const cocktail = orderService.createAlcoholItem({
      type: "prepared_product",
      name: "Test Cocktail",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "Regular", kind: "default", pricePaise: 40_000, inventoryAction: "none", sortOrder: 0, active: true }],
      recipeIngredients: [{ liquorMenuItemId: vodka.id, mlPerUnit: 30 }]
    });
    const rumLarge = database.db.prepare("SELECT id FROM menu_item_variants WHERE menu_item_id = ? AND kind = 'large_bottle'").get(rum.id) as { id: string };

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [
        { menuItemId: cocktail.id, quantity: 2 },
        { menuItemId: rum.id, menuItemVariantId: rumLarge.id, quantity: 1 }
      ]
    });
    const bill = orderService.generateBill(order.orderId);
    expect(() =>
      orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" })
    ).toThrow("Alcohol stock cannot go below zero");

    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(vodka.id)).toEqual({
      sealed_large_count: 1,
      open_large_ml: 0
    });
    expect(database.db.prepare("SELECT sealed_large_count FROM alcohol_stock_levels WHERE menu_item_id = ?").get(rum.id)).toEqual({
      sealed_large_count: 0
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM alcohol_stock_movements WHERE source_id = ?").get(bill.billId)).toEqual({ count: 0 });

    database.close();
  });

  it("deducts alcohol stock for NC bills", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const liquor = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "NC Whisky",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 1,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "750 ml", kind: "large_bottle", pricePaise: 180_000, volumeMl: 750, inventoryAction: "large_bottle", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const large = database.db.prepare("SELECT id FROM menu_item_variants WHERE menu_item_id = ? AND kind = 'large_bottle'").get(liquor.id) as { id: string };
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: liquor.id, menuItemVariantId: large.id, quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);

    orderService.markBillNc(bill.billId, {
      managerApproval: { pin: "1234", reason: "Owner tasting", approvedBy: "manager" }
    });

    expect(database.db.prepare("SELECT sealed_large_count FROM alcohol_stock_levels WHERE menu_item_id = ?").get(liquor.id)).toEqual({
      sealed_large_count: 0
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM alcohol_stock_movements WHERE source_id = ?").get(bill.billId)).toEqual({ count: 1 });

    database.close();
  });

  it("settles cocktails using the recipe snapshot from order time", () => {
    const { database, orderService } = createTestHub();
    const vodka = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Snapshot Vodka",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 1,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const cocktail = orderService.createAlcoholItem({
      type: "prepared_product",
      name: "Snapshot Cocktail",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "Regular", kind: "default", pricePaise: 40_000, inventoryAction: "none", sortOrder: 0, active: true }],
      recipeIngredients: [{ liquorMenuItemId: vodka.id, mlPerUnit: 30 }]
    });

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: cocktail.id, quantity: 1 }]
    });
    orderService.updateAlcoholItem(cocktail.id, {
      recipeIngredients: [{ liquorMenuItemId: vodka.id, mlPerUnit: 90 }]
    });

    const pending = orderService.listAlcoholStorage() as Array<{ id: string; pending_large_ml: number }>;
    expect(pending.find((row) => row.id === vodka.id)).toMatchObject({ pending_large_ml: 30 });

    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });

    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(vodka.id)).toEqual({
      sealed_large_count: 0,
      open_large_ml: 720
    });

    database.close();
  });

  it("keeps separate cocktail rows when a recipe changes before adding it again", () => {
    const { database, orderService } = createTestHub();
    const vodka = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Changed Recipe Vodka",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 1,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const cocktail = orderService.createAlcoholItem({
      type: "prepared_product",
      name: "Changed Recipe Cocktail",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "Regular", kind: "default", pricePaise: 40_000, inventoryAction: "none", sortOrder: 0, active: true }],
      recipeIngredients: [{ liquorMenuItemId: vodka.id, mlPerUnit: 30 }]
    });

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: cocktail.id, quantity: 1 }]
    });
    orderService.updateAlcoholItem(cocktail.id, {
      recipeIngredients: [{ liquorMenuItemId: vodka.id, mlPerUnit: 90 }]
    });
    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: cocktail.id, quantity: 1 }]
    });

    const pending = orderService.listAlcoholStorage() as Array<{ id: string; pending_large_ml: number }>;
    expect(pending.find((row) => row.id === vodka.id)).toMatchObject({ pending_large_ml: 120 });

    const cocktailRows = database.db
      .prepare("SELECT quantity, alcohol_recipe_snapshot_json FROM order_items WHERE menu_item_id = ?")
      .all(cocktail.id) as Array<{ quantity: number; alcohol_recipe_snapshot_json: string }>;
    expect(cocktailRows.map((row) => row.quantity).sort()).toEqual([1, 1]);
    const recipeMl = cocktailRows
      .map((row) => {
        const recipe = JSON.parse(row.alcohol_recipe_snapshot_json) as Array<{ mlPerUnit: number }>;
        return recipe[0]?.mlPerUnit ?? 0;
      })
      .sort((a, b) => a - b);
    expect(recipeMl).toEqual([30, 90]);

    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });

    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(vodka.id)).toEqual({
      sealed_large_count: 0,
      open_large_ml: 630
    });

    database.close();
  });

  it("keeps liquor rows when unpaid cocktail snapshots still reference them", () => {
    const { database, orderService } = createTestHub();
    const vodka = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Snapshot Delete Vodka",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 1,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const cocktail = orderService.createAlcoholItem({
      type: "prepared_product",
      name: "Snapshot Delete Cocktail",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "Regular", kind: "default", pricePaise: 40_000, inventoryAction: "none", sortOrder: 0, active: true }],
      recipeIngredients: [{ liquorMenuItemId: vodka.id, mlPerUnit: 30 }]
    });

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: cocktail.id, quantity: 1 }]
    });
    orderService.updateAlcoholItem(cocktail.id, { recipeIngredients: [] });

    expect(orderService.removeMenuItem(vodka.id)).toEqual({ id: vodka.id, deleted: false, active: false });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });

    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(vodka.id)).toEqual({
      sealed_large_count: 0,
      open_large_ml: 720
    });

    database.close();
  });

  it("clears stale recipes when an alcohol product becomes plain liquor", () => {
    const { database, orderService } = createTestHub();
    const vodka = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Clear Recipe Vodka",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 1,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const product = orderService.createAlcoholItem({
      type: "prepared_product",
      name: "Recipe Product",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "Regular", kind: "default", pricePaise: 40_000, inventoryAction: "none", sortOrder: 0, active: true }],
      recipeIngredients: [{ liquorMenuItemId: vodka.id, mlPerUnit: 30 }]
    });
    const defaultVariant = database.db.prepare("SELECT id FROM menu_item_variants WHERE menu_item_id = ? AND kind = 'default'").get(product.id) as { id: string };

    orderService.updateAlcoholItem(product.id, {
      type: "plain_liquor",
      variants: [{ id: defaultVariant.id, label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }]
    });

    expect(database.db.prepare("SELECT COUNT(*) AS count FROM alcohol_recipe_ingredients WHERE product_menu_item_id = ?").get(product.id)).toEqual({ count: 0 });

    database.close();
  });

  it("rejects active alcohol items without active variants and foreign variant ids", () => {
    const { database, orderService } = createTestHub();
    const whisky = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Guard Whisky",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const rum = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Guard Rum",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const whiskyShot = database.db.prepare("SELECT id FROM menu_item_variants WHERE menu_item_id = ?").get(whisky.id) as { id: string };
    const rumShot = database.db.prepare("SELECT id FROM menu_item_variants WHERE menu_item_id = ?").get(rum.id) as { id: string };

    expect(() =>
      orderService.updateAlcoholItem(whisky.id, {
        active: true,
        variants: [{ id: whiskyShot.id, label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: false }]
      })
    ).toThrow("Active alcohol items need at least one active variation");

    expect(() =>
      orderService.updateAlcoholItem(whisky.id, {
        variants: [{ id: rumShot.id, label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }]
      })
    ).toThrow("Alcohol variation belongs to another item");

    database.close();
  });

  it("rejects prepared alcohol products with stock-affecting variants", () => {
    const { database, orderService } = createTestHub();

    expect(() =>
      orderService.createAlcoholItem({
        type: "prepared_product",
        name: "Bad Cocktail",
        productionUnitId: "unit-bar",
        largeBottleMl: 750,
        smallBottleMl: 180,
        sealedLargeCount: 0,
        openLargeMl: 0,
        sealedSmallCount: 0,
        variants: [{ label: "30 ml", kind: "shot", pricePaise: 40_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
        recipeIngredients: []
      })
    ).toThrow("Prepared alcohol products use one regular non-stock variation");

    const product = orderService.createAlcoholItem({
      type: "prepared_product",
      name: "Good Cocktail",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "Regular", kind: "default", pricePaise: 40_000, inventoryAction: "none", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const defaultVariant = database.db.prepare("SELECT id FROM menu_item_variants WHERE menu_item_id = ?").get(product.id) as { id: string };

    expect(() =>
      orderService.updateAlcoholItem(product.id, {
        variants: [{ id: defaultVariant.id, label: "Bottle", kind: "large_bottle", pricePaise: 100_000, volumeMl: 750, inventoryAction: "large_bottle", sortOrder: 0, active: true }]
      })
    ).toThrow("Prepared alcohol products use one regular non-stock variation");

    database.close();
  });

  it("requires manager PIN for manual alcohol stock edits", () => {
    const { database, orderService } = createTestHub();
    const liquor = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Test Brandy",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });

    expect(() =>
      orderService.adjustAlcoholStock(liquor.id, {
        mode: "delta",
        sealedLargeCount: 1,
        managerApproval: { pin: "1234", reason: "Alcohol stock edit", approvedBy: "manager" }
      })
    ).toThrow("Set a manager PIN before using manager-only actions");

    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    expect(() =>
      orderService.adjustAlcoholStock(liquor.id, {
        mode: "delta",
        sealedLargeCount: -1,
        managerApproval: { pin: "1234", reason: "Alcohol stock edit", approvedBy: "manager" }
      })
    ).toThrow("Alcohol stock cannot go below zero");

    orderService.adjustAlcoholStock(liquor.id, {
      mode: "delta",
      sealedLargeCount: 2,
      openLargeMl: 120,
      managerApproval: { pin: "1234", reason: "Alcohol stock edit", approvedBy: "manager" }
    });

    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(liquor.id)).toEqual({
      sealed_large_count: 2,
      open_large_ml: 120
    });

    database.close();
  });

  it("exposes alcohol stock movement history and disables items that have movement history", () => {
    const { database, orderService } = createTestHub();
    const liquor = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "History Whisky",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });

    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    orderService.adjustAlcoholStock(liquor.id, {
      mode: "delta",
      sealedLargeCount: 1,
      managerApproval: { pin: "1234", reason: "Alcohol stock edit", approvedBy: "manager" }
    });

    const movements = orderService.listAlcoholStockMovements() as Array<{ menu_item_id: string; item_name: string; source_type: string }>;
    expect(movements[0]).toMatchObject({ menu_item_id: liquor.id, item_name: "History Whisky", source_type: "manual_adjustment" });
    expect(orderService.removeMenuItem(liquor.id)).toEqual({ id: liquor.id, deleted: false, active: false });
    expect(database.db.prepare("SELECT active FROM menu_items WHERE id = ?").get(liquor.id)).toEqual({ active: 0 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM alcohol_stock_movements WHERE menu_item_id = ?").get(liquor.id)).toEqual({ count: 1 });

    database.close();
  });

  it("disables liquor instead of deleting it when cocktail recipes still use it", () => {
    const { database, orderService } = createTestHub();
    const liquor = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Recipe Gin",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    orderService.createAlcoholItem({
      type: "prepared_product",
      name: "Gin Sour",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "Regular", kind: "default", pricePaise: 40_000, inventoryAction: "none", sortOrder: 0, active: true }],
      recipeIngredients: [{ liquorMenuItemId: liquor.id, mlPerUnit: 30 }]
    });

    expect(orderService.removeMenuItem(liquor.id)).toEqual({ id: liquor.id, deleted: false, active: false });
    expect(database.db.prepare("SELECT active FROM menu_items WHERE id = ?").get(liquor.id)).toEqual({ active: 0 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM alcohol_recipe_ingredients WHERE liquor_menu_item_id = ?").get(liquor.id)).toEqual({ count: 1 });

    database.close();
  });

  it("preserves an alcohol variant when revising a printed bill", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const liquor = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Revision Whisky",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 2,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [
        { label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true },
        { label: "750 ml", kind: "large_bottle", pricePaise: 180_000, volumeMl: 750, inventoryAction: "large_bottle", sortOrder: 1, active: true }
      ],
      recipeIngredients: []
    });
    const variants = database.db.prepare("SELECT id, kind FROM menu_item_variants WHERE menu_item_id = ?").all(liquor.id) as Array<{ id: string; kind: string }>;
    const shot = variants.find((variant) => variant.kind === "shot") as { id: string };
    const large = variants.find((variant) => variant.kind === "large_bottle") as { id: string };
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: liquor.id, menuItemVariantId: large.id, quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    const orderItem = database.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(order.orderId) as { id: string };

    orderService.updateAlcoholItem(liquor.id, {
      variants: [
        { id: shot.id, label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true },
        { id: large.id, label: "750 ml", kind: "large_bottle", pricePaise: 180_000, volumeMl: 750, inventoryAction: "large_bottle", sortOrder: 1, active: false }
      ]
    });
    const revised = orderService.reviseBill(bill.billId, {
      items: [{ orderItemId: orderItem.id, menuItemId: liquor.id, menuItemVariantId: large.id, quantity: 1 }],
      managerApproval: { pin: "1234", reason: "Corrected quantity", approvedBy: "manager" }
    });

    expect(database.db.prepare("SELECT menu_item_variant_id, unit_price_paise, inventory_action_snapshot FROM order_items WHERE id = ?").get(orderItem.id)).toEqual({
      menu_item_variant_id: large.id,
      unit_price_paise: 180_000,
      inventory_action_snapshot: "large_bottle"
    });
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: revised.totalPaise, receivedBy: "captain-1" });
    expect(database.db.prepare("SELECT sealed_large_count FROM alcohol_stock_levels WHERE menu_item_id = ?").get(liquor.id)).toEqual({ sealed_large_count: 1 });

    database.close();
  });

  it("records revised bill audit totals with existing discount and tip", () => {
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
    const existingItem = database.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(order.orderId) as { id: string };
    database.db
      .prepare("UPDATE bills SET discount_paise = 1000, tip_paise = 500, final_total_paise = total_paise - 500 WHERE id = ?")
      .run(bill.billId);

    orderService.reviseBill(bill.billId, {
      items: [
        { orderItemId: existingItem.id, menuItemId: "item-dal-fry", quantity: 1 },
        { menuItemId: "item-lassi", quantity: 1 }
      ],
      managerApproval: { pin: "1234", reason: "Added lassi", approvedBy: "manager" }
    });

    const liveBill = database.db.prepare("SELECT total_paise, discount_paise, tip_paise, final_total_paise FROM bills WHERE id = ?").get(bill.billId) as {
      total_paise: number;
      discount_paise: number;
      tip_paise: number;
      final_total_paise: number;
    };
    expect(database.db.prepare("SELECT discount_paise, tip_paise, final_total_paise FROM bill_revisions WHERE bill_id = ? ORDER BY revision_number DESC LIMIT 1").get(bill.billId)).toEqual({
      discount_paise: 1000,
      tip_paise: 500,
      final_total_paise: liveBill.final_total_paise
    });

    database.close();
  });

  it("links duplicate open-item KOT rows to the inserted order items", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [
        { openName: "Open Food", openPricePaise: 10_000, saleGroupId: "sg-food", productionUnitId: "unit-kitchen", quantity: 1 },
        { openName: "Open Food", openPricePaise: 12_000, saleGroupId: "sg-food", productionUnitId: "unit-kitchen", quantity: 1 }
      ]
    });

    const linked = database.db
      .prepare(
        `SELECT COUNT(DISTINCT ki.order_item_id) AS count
         FROM kot_items ki
         JOIN order_items oi ON oi.id = ki.order_item_id
         WHERE oi.order_id = ?`
      )
      .get(order.orderId);
    expect(linked).toEqual({ count: 2 });

    database.close();
  });

  it("shifts a running table order to a free table", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    const movement = orderService.moveTable(
      { fromTableId: "table-t1", toTableId: "table-t2", reason: "Guest moved outside" },
      { id: "device-local-admin", name: "Local Admin", role: "admin" }
    );

    expect(movement.kotIds).toHaveLength(1);
    expect(database.db.prepare("SELECT table_id FROM orders WHERE id = ?").get(order.orderId)).toEqual({ table_id: "table-t2" });
    expect(database.db.prepare("SELECT status, current_order_id FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({
      status: "free",
      current_order_id: null
    });
    expect(database.db.prepare("SELECT current_order_id FROM restaurant_tables WHERE id = 'table-t2'").get()).toEqual({
      current_order_id: order.orderId
    });

    database.close();
  });

  it("lets captains shift running tables and selected items opened by another captain", () => {
    const { database, orderService } = createTestHub();
    const captainOne = { id: "device-captain-one", name: "Captain One", role: "captain" as const };
    const captainTwo = { id: "device-captain-two", name: "Captain Two", role: "captain" as const };
    const order = orderService.submitOrder(
      {
        tableId: "table-t1",
        captainId: "spoofed",
        pax: 1,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
      },
      captainOne
    );

    const tableMove = orderService.moveTable({ fromTableId: "table-t1", toTableId: "table-t2", reason: "Captain handoff" }, captainTwo);
    const movedOrder = orderService.getOrder(order.orderId) as { items: Array<{ id: string }>; order: { captain_device_id: string; table_id: string } };
    const item = movedOrder.items[0];
    expect(item).toBeDefined();
    if (!item) throw new Error("Expected submitted order to include a movable item");
    const itemMove = orderService.moveOrderItems(
      { fromTableId: "table-t2", toTableId: "table-t1", reason: "Split after handoff", items: [{ orderItemId: item.id, quantity: 1 }] },
      captainTwo
    );
    const sourceOrderAfterSplit = orderService.getOrder(order.orderId) as { order: { captain_device_id: string; table_id: string } };

    expect(tableMove).toMatchObject({ fromTableId: "table-t1", toTableId: "table-t2", orderId: order.orderId });
    expect(itemMove).toMatchObject({ fromOrderId: order.orderId });
    expect(sourceOrderAfterSplit.order).toMatchObject({
      captain_device_id: "device-captain-one",
      table_id: "table-t2"
    });
    expect(orderService.getTableOrder("table-t1")).not.toBeNull();

    database.close();
  });

  it("shifts selected items and creates source and target KOT transfer tickets", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });
    const item = database.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(order.orderId) as { id: string };

    const movement = orderService.moveOrderItems(
      { fromTableId: "table-t1", toTableId: "table-t2", reason: "Split table", items: [{ orderItemId: item.id, quantity: 1 }] },
      { id: "device-local-admin", name: "Local Admin", role: "admin" }
    );

    expect(movement.sourceKotIds).toHaveLength(1);
    expect(movement.targetKotIds).toHaveLength(1);
    expect(database.db.prepare("SELECT status, current_order_id FROM restaurant_tables WHERE id = 'table-t2'").get()).toMatchObject({
      status: "occupied"
    });
    expect(
      database.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM kot_items
           WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)`
        )
        .get(movement.toOrderId)
    ).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs WHERE target_type = 'KOT'").get()).toEqual({ count: 3 });

    database.close();
  });

  it("merges identical open items when shifting selected items", () => {
    const { database, orderService } = createTestHub();
    const sourceOrder = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ openName: "Chef special", openPricePaise: 12_000, saleGroupId: "sg-food", productionUnitId: "unit-kitchen", quantity: 2 }]
    });
    const targetOrder = orderService.submitOrder({
      tableId: "table-t2",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ openName: "Chef special", openPricePaise: 12_000, saleGroupId: "sg-food", productionUnitId: "unit-kitchen", quantity: 1 }]
    });
    const sourceItem = database.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(sourceOrder.orderId) as { id: string };

    orderService.moveOrderItems(
      { fromTableId: "table-t1", toTableId: "table-t2", reason: "Split table", items: [{ orderItemId: sourceItem.id, quantity: 1 }] },
      { id: "device-local-admin", name: "Local Admin", role: "admin" }
    );

    expect(database.db.prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_id = ? AND name_snapshot = 'Chef special'").get(targetOrder.orderId)).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT quantity FROM order_items WHERE order_id = ? AND name_snapshot = 'Chef special'").get(targetOrder.orderId)).toEqual({ quantity: 2 });

    database.close();
  });

  it("reactivates a cancelled target item when shifted items merge into it", () => {
    const { database, orderService } = createTestHub();
    const source = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });
    const target = orderService.submitOrder({
      tableId: "table-t2",
      captainId: "waiter-2",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    database.db
      .prepare("UPDATE order_items SET quantity = 0, status = 'cancelled' WHERE order_id = ? AND menu_item_id = ?")
      .run(target.orderId, "item-dal-fry");
    const sourceItem = database.db
      .prepare("SELECT id FROM order_items WHERE order_id = ? AND menu_item_id = ?")
      .get(source.orderId, "item-dal-fry") as { id: string };

    orderService.moveOrderItems(
      { fromTableId: "table-t1", toTableId: "table-t2", reason: "Restore cancelled item", items: [{ orderItemId: sourceItem.id, quantity: 1 }] },
      { id: "device-local-admin", name: "Local Admin", role: "admin" }
    );

    expect(
      database.db
        .prepare("SELECT quantity, status FROM order_items WHERE order_id = ? AND menu_item_id = ?")
        .get(target.orderId, "item-dal-fry")
    ).toEqual({ quantity: 1, status: "active" });

    database.close();
  });

  it("keeps shifted item prices separate when the target table has an older catalog snapshot", () => {
    const { database, orderService } = createTestHub();
    const dish = orderService.createMenuItem({ name: "Shift Price Dish", pricePaise: 10_000, active: true });
    const target = orderService.submitOrder({
      tableId: "table-t2",
      captainId: "waiter-2",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: dish.id, quantity: 1 }]
    });
    orderService.updateMenuItem(dish.id, { pricePaise: 15_000 });
    const source = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: dish.id, quantity: 1 }]
    });
    const sourceItem = database.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(source.orderId) as { id: string };

    orderService.moveOrderItems(
      { fromTableId: "table-t1", toTableId: "table-t2", reason: "Join tables", items: [{ orderItemId: sourceItem.id, quantity: 1 }] },
      { id: "device-local-admin", name: "Local Admin", role: "admin" }
    );

    expect(
      database.db.prepare("SELECT quantity, unit_price_paise FROM order_items WHERE order_id = ? AND menu_item_id = ? ORDER BY unit_price_paise").all(target.orderId, dish.id)
    ).toEqual([
      { quantity: 1, unit_price_paise: 10_000 },
      { quantity: 1, unit_price_paise: 15_000 }
    ]);

    database.close();
  });
});
