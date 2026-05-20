import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService alcohol stock adjustments", () => {
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
