import { describe, expect, it } from "vitest";
import type { HubBootstrap, HubOrder } from "../lib/hub-client";
import { buildBillRevisionItems, buildDraftOrderSummary } from "../lib/order-command-builders";

const menuItems: HubBootstrap["menuItems"] = [
  {
    id: "item-1",
    name: "Whisky",
    price_paise: 8_000,
    production_unit_id: "bar",
    production_unit_name: "Bar",
    sale_group_id: "sg-alcohol",
    sale_group_name: "Alcohol",
    sale_group_kind: "alcohol",
    active: 1,
    variants: [{ id: "v180", label: "180 ml", kind: "small_bottle", price_paise: 45_000, volume_ml: 180, inventory_action: "small_bottle", active: true }]
  }
];

describe("mobile order command builders", () => {
  it("builds KOT review summaries with variant labels", () => {
    expect(buildDraftOrderSummary([{ menuItemId: "item-1", menuItemVariantId: "v180", quantity: 2 }], menuItems)).toBe("2 x Whisky 180 ml");
  });

  it("builds revision payload items from sent and draft lines", () => {
    const sentItems: HubOrder["items"] = [
      { id: "sent-1", menu_item_id: "item-1", menu_item_variant_id: "v180", name_snapshot: "Whisky 180 ml", unit_price_paise: 45_000, quantity: 1, status: "sent" },
      { id: "open-1", menu_item_id: null, name_snapshot: "Open Food", unit_price_paise: 12_000, quantity: 2, status: "sent", sale_group_id: "sg-food", production_unit_id: null }
    ];

    expect(buildBillRevisionItems(sentItems, [{ menuItemId: "item-1", menuItemVariantId: "v180", quantity: 3 }])).toEqual([
      { orderItemId: "sent-1", menuItemId: "item-1", menuItemVariantId: "v180", quantity: 1 },
      { orderItemId: "open-1", openName: "Open Food", openPricePaise: 12_000, saleGroupId: "sg-food", productionUnitId: null, quantity: 2 },
      { menuItemId: "item-1", menuItemVariantId: "v180", quantity: 3 }
    ]);
  });
});
