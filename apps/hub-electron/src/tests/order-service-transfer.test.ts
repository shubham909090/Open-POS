import { describe, expect, it } from "vitest";
import { stripPrintStyleMarkers } from "../domain/tickets.js";
import { createTestHub, insertDailySnapshot } from "./helpers.js";

describe("OrderService table and item transfers", () => {
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
    database.db.prepare("UPDATE restaurant_tables SET occupied_at = ? WHERE id = 'table-t1'").run("2026-05-18T10:00:00.000Z");

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
    expect(database.db.prepare("SELECT current_order_id, occupied_at FROM restaurant_tables WHERE id = 'table-t2'").get()).toEqual({
      current_order_id: order.orderId,
      occupied_at: "2026-05-18T10:00:00.000Z"
    });

    database.close();
  });

  it("merges a full table transfer into a running target table", () => {
    const { database, orderService } = createTestHub();
    const sourceOrder = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });
    const targetOrder = orderService.submitOrder({
      tableId: "table-t2",
      captainId: "waiter-2",
      pax: 2,
      orderType: "dine_in",
      items: [{ menuItemId: "item-paneer-tikka", quantity: 1 }]
    });

    const movement = orderService.moveTable(
      { fromTableId: "table-t1", toTableId: "table-t2", reason: "Join tables" },
      { id: "device-local-admin", name: "Local Admin", role: "admin" }
    );

    expect(movement).toMatchObject({
      fromTableId: "table-t1",
      toTableId: "table-t2",
      orderId: targetOrder.orderId
    });
    expect(database.db.prepare("SELECT status, current_order_id FROM restaurant_tables WHERE id = 'table-t1'").get()).toEqual({
      status: "free",
      current_order_id: null
    });
    expect(database.db.prepare("SELECT current_order_id FROM restaurant_tables WHERE id = 'table-t2'").get()).toEqual({
      current_order_id: targetOrder.orderId
    });
    expect(database.db.prepare("SELECT status FROM orders WHERE id = ?").get(sourceOrder.orderId)).toEqual({ status: "cancelled" });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_id = ? AND quantity > 0").get(targetOrder.orderId)).toEqual({ count: 2 });

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
    database.db.prepare("UPDATE restaurant_tables SET occupied_at = ? WHERE id = 'table-t1'").run("2026-05-18T10:15:00.000Z");

    const movement = orderService.moveOrderItems(
      { fromTableId: "table-t1", toTableId: "table-t2", reason: "Split table", items: [{ orderItemId: item.id, quantity: 2 }] },
      { id: "device-local-admin", name: "Local Admin", role: "admin" }
    );

    expect(movement.sourceKotIds).toHaveLength(1);
    expect(movement.targetKotIds).toHaveLength(1);
    expect(movement.printJobIds).toHaveLength(2);
    expect(database.db.prepare("SELECT status, current_order_id, occupied_at FROM restaurant_tables WHERE id = 'table-t2'").get()).toMatchObject({
      status: "occupied",
      occupied_at: "2026-05-18T10:15:00.000Z"
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
    const shiftKots = database.db.prepare("SELECT type, sequence FROM kots WHERE id IN (?, ?) ORDER BY created_at").all(...movement.sourceKotIds, ...movement.targetKotIds);
    expect(shiftKots).toEqual([
      { type: "table_shifted", sequence: 1 },
      { type: "table_shifted", sequence: 1 }
    ]);

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
