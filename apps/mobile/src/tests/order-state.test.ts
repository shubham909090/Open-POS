import { describe, expect, it } from "vitest";
import { mobileDraftOrderStateSignature, mobileSavedOrderStateSignature } from "../lib/order-state";
import type { HubBootstrap, HubOrder } from "../lib/hub-client";

const menuItems: HubBootstrap["menuItems"] = [
  {
    id: "item-whisky",
    name: "Imported Whisky",
    price_paise: 4_000,
    production_unit_id: "bar",
    production_unit_name: "Bar",
    sale_group_id: "sg-alcohol",
    sale_group_kind: "alcohol",
    sale_group_name: "Alcohol",
    active: 1,
    variants: [
      { id: "v30", label: "30 ml", kind: "shot", price_paise: 4_000, volume_ml: 30, inventory_action: "large_ml", active: true },
      { id: "v180", label: "180 ml", kind: "small_bottle", price_paise: 25_000, volume_ml: 180, inventory_action: "small_bottle", active: true }
    ]
  }
];

const sentItems: HubOrder["items"] = [
  {
    id: "oi-1",
    menu_item_id: "item-whisky",
    menu_item_variant_id: "v30",
    name_snapshot: "Imported Whisky 30 ml",
    unit_price_paise: 4_000,
    quantity: 2,
    sale_group_id: "sg-alcohol",
    production_unit_id: "bar",
    status: "sent"
  }
];

describe("mobile order state dirty signatures", () => {
  it("matches unchanged sent items and detects edits", () => {
    const saved = mobileSavedOrderStateSignature(sentItems);
    expect(
      mobileDraftOrderStateSignature(
        [{ orderItemId: "oi-1", menuItemId: "item-whisky", menuItemVariantId: "v30", unitPricePaise: 4_000, saleGroupId: "sg-alcohol", productionUnitId: "bar", quantity: 2 }],
        menuItems
      )
    ).toBe(saved);
    expect(
      mobileDraftOrderStateSignature(
        [{ orderItemId: "oi-1", menuItemId: "item-whisky", menuItemVariantId: "v30", unitPricePaise: 4_000, saleGroupId: "sg-alcohol", productionUnitId: "bar", quantity: 3 }],
        menuItems
      )
    ).not.toBe(saved);
  });

  it("keeps existing zero removals dirty but ignores new zero lines", () => {
    const saved = mobileSavedOrderStateSignature(sentItems);
    expect(
      mobileDraftOrderStateSignature(
        [{ orderItemId: "oi-1", menuItemId: "item-whisky", menuItemVariantId: "v30", unitPricePaise: 4_000, saleGroupId: "sg-alcohol", productionUnitId: "bar", quantity: 0 }],
        menuItems
      )
    ).not.toBe(saved);
    expect(
      mobileDraftOrderStateSignature(
        [
          { orderItemId: "oi-1", menuItemId: "item-whisky", menuItemVariantId: "v30", unitPricePaise: 4_000, saleGroupId: "sg-alcohol", productionUnitId: "bar", quantity: 2 },
          { menuItemId: "item-whisky", menuItemVariantId: "v180", quantity: 0 }
        ],
        menuItems
      )
    ).toBe(saved);
  });
});
