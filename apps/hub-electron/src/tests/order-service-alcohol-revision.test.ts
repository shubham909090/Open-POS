import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("OrderService alcohol bill revision", () => {
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
});
