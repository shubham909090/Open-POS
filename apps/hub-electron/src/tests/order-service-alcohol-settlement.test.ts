import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService alcohol settlement stock", () => {
  it("allows alcohol settlement to make stock negative so billing is never blocked", () => {
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
        { menuItemId: cocktail.id, quantity: 30 },
        { menuItemId: rum.id, menuItemVariantId: rumLarge.id, quantity: 1 }
      ]
    });
    const bill = orderService.generateBill(order.orderId);
    const settlement = orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });

    expect(settlement.status).toBe("paid");
    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(vodka.id)).toEqual({
      sealed_large_count: 0,
      open_large_ml: -150
    });
    expect(database.db.prepare("SELECT sealed_large_count FROM alcohol_stock_levels WHERE menu_item_id = ?").get(rum.id)).toEqual({
      sealed_large_count: -1
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM alcohol_stock_movements WHERE source_id = ?").get(bill.billId)).toEqual({ count: 2 });

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
});
