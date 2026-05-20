import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService setup catalog", () => {
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

  it("orders floors and tables by saved sort order", () => {
    const { database, orderService } = createTestHub();
    const upstairs = orderService.createFloor({ name: "Upstairs", sortOrder: 10 });
    const patio = orderService.createFloor({ name: "Patio", sortOrder: 20 });
    orderService.createTable({ floorId: patio.id, name: "P2", sortOrder: 20 });
    orderService.createTable({ floorId: patio.id, name: "P1", sortOrder: 10 });
    orderService.updateFloor("floor-main", { sortOrder: 30 });
    orderService.updateFloor(patio.id, { sortOrder: 0 });
    orderService.updateFloor(upstairs.id, { sortOrder: 1 });

    expect((orderService.listFloors() as Array<{ id: string }>).slice(0, 2).map((floor) => floor.id)).toEqual([patio.id, upstairs.id]);
    expect(
      (orderService.listTables() as Array<{ floor_id: string; name: string }>)
        .filter((table) => table.floor_id === patio.id)
        .map((table) => table.name)
    ).toEqual(["P1", "P2"]);

    database.close();
  });

  it("bulk removes dishes using safe delete semantics", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const unusedDish = orderService.createMenuItem({ name: "Bulk Papad", pricePaise: 4000 });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    orderService.cancelOrder(order.orderId, {
      reason: "Test cleanup",
      requestedBy: "captain-1",
      managerApproval: { pin: "1234", reason: "Test cleanup", approvedBy: "manager" }
    });

    const result = orderService.bulkRemoveMenuItems("dish", {
      managerApproval: { pin: "1234", reason: "Bulk delete dishes", approvedBy: "manager" }
    });

    expect(result).toMatchObject({ deleted: 3, disabled: 1, failed: 0, errors: [] });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE id = ?").get(unusedDish.id)).toEqual({ count: 0 });
    expect(database.db.prepare("SELECT active FROM menu_items WHERE id = 'item-dal-fry'").get()).toEqual({ active: 0 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE sale_group_id = 'sg-alcohol'").get()).toEqual({ count: 0 });

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
});
