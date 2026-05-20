import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService alcohol catalog rules", () => {
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

  it("bulk removes alcohol items only with Master PIN approval", () => {
    const { database, orderService } = createTestHub();
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    const unusedLiquor = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Bulk Delete Vodka",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const stockedLiquor = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Bulk Disable Opening Stock Rum",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 1,
      openLargeMl: 120,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const usedLiquor = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Bulk Disable Gin",
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
      name: "Bulk Gin Sour",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 0,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "Regular", kind: "default", pricePaise: 40_000, inventoryAction: "none", sortOrder: 0, active: true }],
      recipeIngredients: [{ liquorMenuItemId: usedLiquor.id, mlPerUnit: 30 }]
    });

    expect(() =>
      orderService.bulkRemoveMenuItems("alcohol", {
        managerApproval: { pin: "1234", reason: "Wrong approval", approvedBy: "manager" }
      })
    ).toThrow("Master PIN is required for this action");

    const result = orderService.bulkRemoveMenuItems("alcohol", {
      masterApproval: { pin: "9876", reason: "Bulk delete alcohol", approvedBy: "owner" }
    });

    expect(result).toMatchObject({ deleted: 2, disabled: 2, failed: 0, errors: [] });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE id = ?").get(unusedLiquor.id)).toEqual({ count: 0 });
    expect(database.db.prepare("SELECT active FROM menu_items WHERE id = ?").get(usedLiquor.id)).toEqual({ active: 0 });
    expect(database.db.prepare("SELECT active FROM menu_items WHERE id = ?").get(stockedLiquor.id)).toEqual({ active: 0 });
    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(stockedLiquor.id)).toEqual({
      sealed_large_count: 1,
      open_large_ml: 120
    });

    database.close();
  });
});
