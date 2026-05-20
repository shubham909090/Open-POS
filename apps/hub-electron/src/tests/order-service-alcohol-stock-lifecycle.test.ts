import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService alcohol stock lifecycle", () => {
  it("applies liquor stock deltas when a paid history bill is edited", () => {
    const { database, orderService } = createTestHub();
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    const whisky = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "History Edit Whisky",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 1,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const shot = database.db.prepare("SELECT id FROM menu_item_variants WHERE menu_item_id = ? AND kind = 'shot'").get(whisky.id) as { id: string };
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: whisky.id, menuItemVariantId: shot.id, quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });
    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(whisky.id)).toEqual({
      sealed_large_count: 0,
      open_large_ml: 720
    });

    orderService.editHistoryBill(bill.billId, {
      items: [{ menuItemId: whisky.id, menuItemVariantId: shot.id, quantity: 2 }],
      payments: [{ method: "cash", amountPaise: 20_000 }],
      masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
    });

    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(whisky.id)).toEqual({
      sealed_large_count: 0,
      open_large_ml: 690
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM alcohol_stock_movements WHERE source_id = ? AND source_type = 'bill_history_edit'").get(bill.billId)).toEqual({ count: 1 });

    database.close();
  });

  it("restores liquor stock when a paid history edit removes the liquor item", () => {
    const { database, orderService } = createTestHub();
    orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    const whisky = orderService.createAlcoholItem({
      type: "plain_liquor",
      name: "Removed History Whisky",
      productionUnitId: "unit-bar",
      largeBottleMl: 750,
      smallBottleMl: 180,
      sealedLargeCount: 1,
      openLargeMl: 0,
      sealedSmallCount: 0,
      variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
      recipeIngredients: []
    });
    const shot = database.db.prepare("SELECT id FROM menu_item_variants WHERE menu_item_id = ? AND kind = 'shot'").get(whisky.id) as { id: string };
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: whisky.id, menuItemVariantId: shot.id, quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });

    orderService.editHistoryBill(bill.billId, {
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }],
      payments: [{ method: "cash", amountPaise: 18_000 }],
      masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" }
    });

    expect(database.db.prepare("SELECT sealed_large_count, open_large_ml FROM alcohol_stock_levels WHERE menu_item_id = ?").get(whisky.id)).toEqual({
      sealed_large_count: 1,
      open_large_ml: 0
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM alcohol_stock_movements WHERE source_id = ? AND source_type = 'bill_history_edit'").get(bill.billId)).toEqual({ count: 1 });

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
});
