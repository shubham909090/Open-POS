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

  it("creates an order, KOT, print job, and local events without cloud event outbox rows", () => {
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
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM event_log").get()).toEqual({ count: 4 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending'").get()).toEqual({ count: 0 });
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
    const sequences = database.db.prepare("SELECT production_unit_id, type, sequence FROM kots ORDER BY production_unit_id, created_at").all();
    expect(sequences).toEqual([
      { production_unit_id: "unit-bar", type: "new", sequence: 2 },
      { production_unit_id: "unit-bar", type: "modified", sequence: 2 },
      { production_unit_id: "unit-kitchen", type: "new", sequence: 1 },
      { production_unit_id: "unit-kitchen", type: "modified", sequence: 1 }
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

  it("keeps the original KOT number for KOT-only orders when later modified", () => {
    const { database, orderService } = createTestHub();

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const firstKot = database.db.prepare("SELECT sequence FROM kots WHERE order_id = ?").get(order.orderId) as { sequence: number };

    orderService.updateOrderState(order.orderId, {
      saveMode: "save_print",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });

    expect(database.db.prepare("SELECT type, sequence, ticket_label FROM kots WHERE order_id = ? ORDER BY created_at, rowid").all(order.orderId)).toEqual([
      { type: "new", sequence: firstKot.sequence, ticket_label: "KOT" },
      { type: "modified", sequence: firstKot.sequence, ticket_label: "KOT" }
    ]);

    database.close();
  });

  it("hides KDS tickets when the kitchen screen is disabled for a counter", () => {
    const { database, orderService } = createTestHub();
    orderService.updateProductionUnit("unit-kitchen", { kdsEnabled: false });
    const result = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    expect(result.printJobIds).toHaveLength(1);
    expect(orderService.listKds("unit-kitchen")).toEqual([]);
    expect(database.db.prepare("SELECT status FROM kots WHERE id = ?").get(result.kotIds[0])).toEqual({ status: "served" });

    database.close();
  });

  it("uses the final overridden production unit KDS flag for menu items", () => {
    const { database, orderService } = createTestHub();
    orderService.updateProductionUnit("unit-bar", { kdsEnabled: false });
    const result = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", productionUnitId: "unit-bar", quantity: 1 }]
    });

    expect(result.printJobIds).toHaveLength(1);
    expect(orderService.listKds("unit-bar")).toEqual([]);
    expect(database.db.prepare("SELECT production_unit_id, status FROM kots WHERE id = ?").get(result.kotIds[0])).toEqual({
      production_unit_id: "unit-bar",
      status: "served"
    });

    database.close();
  });

  it("serves only that counter's open KDS tickets when a kitchen screen is disabled", () => {
    const { database, orderService } = createTestHub();
    const result = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [
        { menuItemId: "item-dal-fry", quantity: 1 },
        { menuItemId: "item-lassi", quantity: 1 }
      ]
    });
    database.db.prepare("UPDATE kots SET status = 'preparing' WHERE production_unit_id = 'unit-kitchen'").run();
    database.db.prepare("UPDATE kots SET status = 'ready' WHERE production_unit_id = 'unit-bar'").run();

    orderService.updateProductionUnit("unit-kitchen", { kdsEnabled: false });

    expect(orderService.listKds("unit-kitchen")).toEqual([]);
    expect(orderService.listKds("unit-bar")).toHaveLength(1);
    expect(database.db.prepare("SELECT production_unit_id, status FROM kots WHERE order_id = ? ORDER BY production_unit_id").all(result.orderId)).toEqual([
      { production_unit_id: "unit-bar", status: "ready" },
      { production_unit_id: "unit-kitchen", status: "served" }
    ]);

    database.close();
  });

  it("uses the open-unit-created index for KDS visible ticket reads", () => {
    const { database } = createTestHub();

    const plan = database.db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT k.id
         FROM kots k
         JOIN orders o ON o.id = k.order_id
         JOIN restaurant_tables t ON t.id = o.table_id
         JOIN production_units pu ON pu.id = k.production_unit_id
         WHERE k.production_unit_id = ? AND pu.kds_enabled = 1 AND k.status IN ('queued', 'preparing', 'ready')
         ORDER BY k.created_at ASC, k.rowid ASC
         LIMIT 250`
      )
      .all("unit-kitchen") as Array<{ detail: string }>;

    expect(plan.map((row) => row.detail).join("\n")).toContain("idx_kots_open_unit_created");

    database.close();
  });

  it("marks all pending KDS tickets served in one cleanup action", () => {
    const { database, orderService } = createTestHub();
    const result = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [
        { menuItemId: "item-dal-fry", quantity: 1 },
        { menuItemId: "item-lassi", quantity: 1 }
      ]
    });

    expect(result.kotIds).toHaveLength(2);
    database.db.prepare("UPDATE kots SET status = 'preparing' WHERE production_unit_id = 'unit-kitchen'").run();
    database.db.prepare("UPDATE kots SET status = 'ready' WHERE production_unit_id = 'unit-bar'").run();
    database.db
      .prepare(
        `INSERT INTO kots (id, order_id, production_unit_id, type, status, sequence, ticket_label, created_at)
         VALUES
          ('kot-existing-served', ?, 'unit-kitchen', 'new', 'served', 9001, 'KOT', '2026-01-01T00:00:00.000Z'),
          ('kot-existing-cancelled', ?, 'unit-bar', 'cancelled', 'cancelled', 9002, 'BOT', '2026-01-01T00:00:01.000Z')`
      )
      .run(result.orderId, result.orderId);

    expect(orderService.listKds("unit-kitchen")).toHaveLength(1);
    expect(orderService.listKds("unit-bar")).toHaveLength(1);
    expect(database.db.prepare("SELECT status, COUNT(*) AS count FROM kots GROUP BY status ORDER BY status").all()).toEqual([
      { status: "cancelled", count: 1 },
      { status: "preparing", count: 1 },
      { status: "ready", count: 1 },
      { status: "served", count: 1 }
    ]);

    expect(orderService.markAllKdsServed()).toEqual({ markedServed: 2 });
    expect(orderService.listKds("unit-kitchen")).toEqual([]);
    expect(orderService.listKds("unit-bar")).toEqual([]);
    expect(database.db.prepare("SELECT status, COUNT(*) AS count FROM kots GROUP BY status ORDER BY status").all()).toEqual([
      { status: "cancelled", count: 1 },
      { status: "served", count: 3 }
    ]);

    expect(orderService.markAllKdsServed()).toEqual({ markedServed: 0 });

    database.close();
  });

  it("keeps KOT print jobs but stores new KDS tickets as served while KDS is off", () => {
    const { database, orderService } = createTestHub();

    expect(orderService.isKdsEnabled()).toBe(true);
    expect(orderService.updateKdsEnabled({ enabled: false })).toEqual({ enabled: false, markedServed: 0 });

    const result = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    expect(result.kotIds).toHaveLength(1);
    expect(result.printJobIds).toHaveLength(1);
    expect(orderService.listKds("unit-kitchen")).toEqual([]);
    expect(database.db.prepare("SELECT status FROM kots WHERE id = ?").get(result.kotIds[0])).toEqual({
      status: "served"
    });

    database.close();
  });

  it("can save KOTs for kitchen screens without creating printer jobs", () => {
    const { database, orderService } = createTestHub();

    const result = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 2,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    expect(result.kotIds).toHaveLength(1);
    expect(result.printJobIds).toEqual([]);
    expect(orderService.listKds("unit-kitchen")).toHaveLength(1);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs").get()).toEqual({ count: 0 });

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
    const cancelledKotId = cancelled.kotIds[0];
    if (!cancelledKotId) {
      throw new Error("Expected cancellation KOT");
    }
    expect(database.db.prepare("SELECT type FROM kots WHERE id = ?").get(cancelledKotId)).toEqual({
      type: "cancelled"
    });
    expect(database.db.prepare("SELECT status, current_order_id FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({
      status: "free",
      current_order_id: null
    });

    database.close();
  });

  it("stores cancellation KOTs as served when the counter KDS is disabled", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-paneer-tikka", quantity: 1 }]
    });
    orderService.updateProductionUnit("unit-kitchen", { kdsEnabled: false });
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });

    const cancelled = orderService.cancelOrder(order.orderId, {
      reason: "Guest left",
      requestedBy: "captain-1",
      managerApproval: { pin: "1234", reason: "Guest left", approvedBy: "manager" }
    });

    expect(database.db.prepare("SELECT type, status FROM kots WHERE id = ?").get(cancelled.kotIds[0])).toEqual({
      type: "cancelled",
      status: "served"
    });

    database.close();
  });

  it("cancels selected sent item quantities with manager approval and reuses the original KOT number", () => {
    const { database, orderService } = createTestHub();

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-paneer-tikka", quantity: 3 }]
    });
    const firstKot = database.db.prepare("SELECT sequence FROM kots WHERE order_id = ?").get(order.orderId) as { sequence: number };
    const item = database.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(order.orderId) as { id: string };
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });

    const cancelled = orderService.cancelOrderItems(order.orderId, {
      reason: "Guest changed mind",
      requestedBy: "captain-1",
      managerApproval: { pin: "1234", reason: "Guest changed mind", approvedBy: "manager" },
      items: [{ orderItemId: item.id, quantity: 1 }]
    });

    expect(cancelled.kotIds).toHaveLength(1);
    expect(cancelled.printJobIds).toHaveLength(1);
    expect(database.db.prepare("SELECT quantity, status FROM order_items WHERE id = ?").get(item.id)).toEqual({ quantity: 2, status: "active" });
    expect(database.db.prepare("SELECT type, sequence, reason FROM kots ORDER BY created_at DESC, rowid DESC LIMIT 1").get()).toEqual({
      type: "partial_cancel",
      sequence: firstKot.sequence,
      reason: "Guest changed mind"
    });
    const cancellationPrintJobId = cancelled.printJobIds[0];
    if (!cancellationPrintJobId) {
      throw new Error("Expected cancellation print job");
    }
    const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE id = ?").get(cancellationPrintJobId) as { payload: string };
    expect(printJob.payload).toContain("CANCELLED");
    expect(printJob.payload).toContain("Guest changed mind");
    expect(printJob.payload).toContain("-1 x Paneer Tikka");

    database.close();
  });


});
