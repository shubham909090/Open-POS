import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService running order state", () => {
  it("includes live order totals and sent counts on table rows", () => {
    const { database, orderService } = createTestHub();

    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 2,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });

    const tables = orderService.listTables() as Array<{ id: string; current_order_total_paise: number; sent_item_count: number }>;
    expect(tables.find((table) => table.id === "table-t1")).toMatchObject({
      current_order_total_paise: 36_000,
      sent_item_count: 2
    });
    expect(tables.find((table) => table.id === "table-t2")).toMatchObject({
      current_order_total_paise: 0,
      sent_item_count: 0
    });

    database.close();
  });

  it("updates running table state without KOTs on save and with KOTs on save and print", () => {
    const { database, orderService } = createTestHub();

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    const saved = orderService.updateOrderState(order.orderId, {
      saveMode: "save",
      items: [
        { menuItemId: "item-dal-fry", quantity: 3 },
        { menuItemId: "item-lassi", quantity: 1 }
      ]
    });
    expect(saved.kotIds).toEqual([]);
    expect(saved.printJobIds).toEqual([]);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM kots").get()).toEqual({ count: 1 });

    const printed = orderService.updateOrderState(order.orderId, {
      saveMode: "save_print",
      items: [
        { menuItemId: "item-dal-fry", quantity: 2 },
        { menuItemId: "item-lassi", quantity: 2 }
      ]
    });
    expect(printed.kotIds).toHaveLength(2);
    expect(printed.printJobIds).toHaveLength(2);
    expect(database.db.prepare("SELECT type, quantity_delta FROM kots JOIN kot_items ON kot_items.kot_id = kots.id WHERE type != 'new' ORDER BY type, quantity_delta").all()).toEqual([
      { type: "modified", quantity_delta: 1 },
      { type: "partial_cancel", quantity_delta: -1 }
    ]);

    database.close();
  });

  it("keeps a running table from being saved with zero active items", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    expect(() =>
      orderService.updateOrderState(order.orderId, {
        saveMode: "save_print",
        items: []
      })
    ).toThrow("Running table must keep at least one item. Use Cancel order instead.");

    expect(database.db.prepare("SELECT status FROM orders WHERE id = ?").get(order.orderId)).toEqual({ status: "open" });
    expect(database.db.prepare("SELECT status, current_order_id FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({
      status: "occupied",
      current_order_id: order.orderId
    });
    expect(database.db.prepare("SELECT quantity, status FROM order_items WHERE order_id = ?").get(order.orderId)).toEqual({
      quantity: 1,
      status: "active"
    });

    database.close();
  });

  it("stores merged item notes and prints them under KOT item rows", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot_print",
      items: [
        { menuItemId: "item-paneer-tikka", quantity: 1, note: "No onion" },
        { menuItemId: "item-paneer-tikka", quantity: 1, note: "extra spicy" },
        { menuItemId: "item-paneer-tikka", quantity: 1, note: "No onion" }
      ]
    });
    const orderItem = database.db.prepare("SELECT quantity, note FROM order_items WHERE order_id = ?").get(order.orderId) as { quantity: number; note: string };
    const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE target_type = 'KOT' ORDER BY created_at DESC LIMIT 1").get() as { payload: string };
    const kotItem = database.db.prepare("SELECT quantity_delta, note_snapshot FROM kot_items ORDER BY id DESC LIMIT 1").get() as { quantity_delta: number; note_snapshot: string };

    expect(orderItem).toEqual({ quantity: 3, note: "No onion; extra spicy" });
    expect(kotItem).toEqual({ quantity_delta: 3, note_snapshot: "No onion; extra spicy" });
    expect(printJob.payload).toContain("+3 x Paneer Tikka");
    expect(printJob.payload).toContain("No onion; extra spicy");

    database.close();
  });

  it("edits item notes on the existing order item without cancel and re-add deltas", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-paneer-tikka", quantity: 1, note: "No onion" }]
    });
    const originalItem = database.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(order.orderId) as { id: string };

    orderService.updateOrderState(order.orderId, {
      saveMode: "save_print",
      items: [{ orderItemId: originalItem.id, menuItemId: "item-paneer-tikka", quantity: 1, note: "No onion; extra spicy" }]
    });

    const rows = database.db.prepare("SELECT id, quantity, note, status FROM order_items WHERE order_id = ? ORDER BY created_at").all(order.orderId);
    const latestKotItem = database.db
      .prepare(
        `SELECT k.type, ki.quantity_delta, ki.note_snapshot
         FROM kot_items ki
         JOIN kots k ON k.id = ki.kot_id
         WHERE k.order_id = ?
         ORDER BY k.created_at DESC, k.rowid DESC, ki.rowid DESC
         LIMIT 1`
      )
      .get(order.orderId) as { type: string; quantity_delta: number; note_snapshot: string | null };

    expect(rows).toEqual([{ id: originalItem.id, quantity: 1, note: "No onion; extra spicy", status: "active" }]);
    expect(latestKotItem).toEqual({ type: "modified", quantity_delta: 0, note_snapshot: "No onion; extra spicy" });

    database.close();
  });

  it("merges new notes into an existing running item when the same item is sent again", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-paneer-tikka", quantity: 1, note: "No onion" }]
    });

    orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-paneer-tikka", quantity: 1, note: "extra spicy" }]
    });

    const rows = database.db.prepare("SELECT quantity, note, status FROM order_items WHERE order_id = ?").all(order.orderId);
    expect(rows).toEqual([{ quantity: 2, note: "No onion; extra spicy", status: "active" }]);

    database.close();
  });

  it("clears item notes during sent-order edit and sends a note-only modified ticket", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-paneer-tikka", quantity: 1, note: "No onion" }]
    });
    const originalItem = database.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(order.orderId) as { id: string };

    orderService.updateOrderState(order.orderId, {
      saveMode: "save_print",
      items: [{ orderItemId: originalItem.id, menuItemId: "item-paneer-tikka", quantity: 1, note: "" }]
    });

    const row = database.db.prepare("SELECT id, quantity, note, status FROM order_items WHERE id = ?").get(originalItem.id);
    const latestKotItem = database.db
      .prepare(
        `SELECT k.type, ki.quantity_delta, ki.note_snapshot
         FROM kot_items ki
         JOIN kots k ON k.id = ki.kot_id
         WHERE k.order_id = ?
         ORDER BY k.created_at DESC, k.rowid DESC, ki.rowid DESC
         LIMIT 1`
      )
      .get(order.orderId) as { type: string; quantity_delta: number; note_snapshot: string | null };

    expect(row).toEqual({ id: originalItem.id, quantity: 1, note: null, status: "active" });
    expect(latestKotItem).toEqual({ type: "modified", quantity_delta: 0, note_snapshot: null });

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
});
