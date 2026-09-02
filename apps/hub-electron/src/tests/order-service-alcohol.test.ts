import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService alcohol stock adjustments", () => {
  it("allows partial corrections of sales deficits without creating a new deficit", () => {
    const { database, orderService } = createTestHub();
    try {
      orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
      orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
      const liquor = orderService.createAlcoholItem({
        type: "plain_liquor", name: "Deficit Whisky", openLargeMl: -1140, sealedSmallCount: -16,
        variants: [{ label: "30 ml", kind: "shot", pricePaise: 10000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }]
      });
      const managerApproval = { pin: "1234", reason: "Stock received", approvedBy: "manager" };
      const masterApproval = { pin: "9876", reason: "Physical stock count", approvedBy: "owner" };
      orderService.adjustAlcoholStock(liquor.id, { mode: "delta", openLargeMl: 1140, managerApproval });
      expect(database.db.prepare("SELECT open_large_ml, sealed_small_count FROM alcohol_stock_levels WHERE menu_item_id = ?").get(liquor.id))
        .toEqual({ open_large_ml: 0, sealed_small_count: -16 });
      orderService.adjustAlcoholStock(liquor.id, { mode: "delta", sealedSmallCount: 4, managerApproval });
      expect(() => orderService.adjustAlcoholStock(liquor.id, { mode: "delta", sealedSmallCount: -1, masterApproval }))
        .toThrow("Stock corrections cannot create or increase a negative balance");
      expect(() => orderService.adjustAlcoholStock(liquor.id, { mode: "set", sealedSmallCount: -2, masterApproval }))
        .toThrow("Stock corrections cannot create or increase a negative balance");
      orderService.adjustAlcoholStock(liquor.id, { mode: "set", sealedSmallCount: 0, masterApproval });
      expect(database.db.prepare("SELECT sealed_small_count FROM alcohol_stock_levels WHERE menu_item_id = ?").get(liquor.id))
        .toEqual({ sealed_small_count: 0 });
    } finally {
      database.close();
    }
  });

  it("resets only liquor balances with Master PIN and keeps bills, pending orders, and movements", () => {
    const { database, orderService } = createTestHub();
    try {
      orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
      orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
      const liquor = orderService.createAlcoholItem({
        type: "plain_liquor", name: "Reset Whisky", openLargeMl: -1140, sealedSmallCount: -16,
        variants: [{ label: "30 ml", kind: "shot", pricePaise: 10000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }]
      });
      const prepared = orderService.createAlcoholItem({
        type: "prepared_product", name: "Reset Cocktail", openLargeMl: 25,
        variants: [{ label: "Regular", kind: "default", pricePaise: 10000, inventoryAction: "none", sortOrder: 0, active: true }],
        recipeIngredients: [{ liquorMenuItemId: liquor.id, mlPerUnit: 30 }]
      });
      const paidOrder = orderService.submitOrder({ tableId: "table-t1", captainId: "waiter-1", pax: 1, orderType: "dine_in", items: [{ menuItemId: liquor.id, quantity: 1 }] });
      const bill = orderService.generateBill(paidOrder.orderId);
      orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });
      orderService.submitOrder({ tableId: "table-t1", captainId: "waiter-1", pax: 1, orderType: "dine_in", items: [{ menuItemId: liquor.id, quantity: 2 }] });
      const before = {
        bills: database.db.prepare("SELECT * FROM bills").all(),
        payments: database.db.prepare("SELECT * FROM payments").all(),
        orders: database.db.prepare("SELECT * FROM orders").all(),
        items: database.db.prepare("SELECT * FROM order_items").all(),
        movements: database.db.prepare("SELECT * FROM alcohol_stock_movements").all()
      };
      expect(() => orderService.resetAlcoholStock({ masterApproval: { pin: "1234", reason: "Reset stock", approvedBy: "owner" } }))
        .toThrow("Master PIN is incorrect");
      const result = orderService.resetAlcoholStock({ masterApproval: { pin: "9876", reason: "Start fresh stock count", approvedBy: "owner" } });
      expect(result).toEqual({ resetCount: 1 });
      expect(database.db.prepare("SELECT sealed_large_count, open_large_ml, sealed_small_count FROM alcohol_stock_levels WHERE menu_item_id = ?").get(liquor.id))
        .toEqual({ sealed_large_count: 0, open_large_ml: 0, sealed_small_count: 0 });
      expect(database.db.prepare("SELECT open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(prepared.id)).toEqual({ open_large_ml: 25 });
      expect(database.db.prepare("SELECT * FROM bills").all()).toEqual(before.bills);
      expect(database.db.prepare("SELECT * FROM payments").all()).toEqual(before.payments);
      expect(database.db.prepare("SELECT * FROM orders").all()).toEqual(before.orders);
      expect(database.db.prepare("SELECT * FROM order_items").all()).toEqual(before.items);
      expect(database.db.prepare("SELECT * FROM alcohol_stock_movements WHERE source_type != 'liquor_stock_reset'").all()).toEqual(before.movements);
      expect(database.db.prepare("SELECT delta_open_large_ml, delta_sealed_small, approved_by FROM alcohol_stock_movements WHERE source_type = 'liquor_stock_reset'").get())
        .toEqual({ delta_open_large_ml: 1170, delta_sealed_small: 16, approved_by: "owner" });
      expect(orderService.listAlcoholStorage()).toContainEqual(expect.objectContaining({ id: liquor.id, total_available_ml: 0, pending_total_ml: 60, expected_after_settlement_ml: -60 }));
      expect(orderService.resetAlcoholStock({ masterApproval: { pin: "9876", reason: "Already reset", approvedBy: "owner" } })).toEqual({ resetCount: 0 });
    } finally {
      database.close();
    }
  });

  it("uses manager PIN for positive stock additions and master PIN for set exact or lowering edits", () => {
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
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    expect(() =>
      orderService.adjustAlcoholStock(liquor.id, {
        mode: "delta",
        sealedLargeCount: -1,
        managerApproval: { pin: "1234", reason: "Alcohol stock edit", approvedBy: "manager" }
      })
    ).toThrow("Master PIN is required for lowering liquor stock");

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

    expect(() =>
      orderService.adjustAlcoholStock(liquor.id, {
        mode: "set",
        sealedLargeCount: 1,
        openLargeMl: 0,
        sealedSmallCount: 0,
        managerApproval: { pin: "1234", reason: "Alcohol stock edit", approvedBy: "manager" }
      })
    ).toThrow("Master PIN is required for exact liquor stock edits");

    orderService.adjustAlcoholStock(liquor.id, {
      mode: "set",
      sealedLargeCount: 1,
      openLargeMl: 0,
      sealedSmallCount: 0,
      masterApproval: { pin: "9876", reason: "Owner stock correction", approvedBy: "owner" }
    });

    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(liquor.id)).toEqual({
      sealed_large_count: 1,
      open_large_ml: 0
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
});
