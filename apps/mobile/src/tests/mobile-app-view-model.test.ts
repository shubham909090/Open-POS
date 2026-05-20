import { describe, expect, it } from "vitest";
import type { HubBootstrap, HubOrder } from "../lib/hub-client";
import { getMobileServiceViewModel } from "../lib/mobile-app-view-model";

const bootstrap: HubBootstrap = {
  currentBusinessDay: { id: "day-1", business_date: "2026-05-20", period_start_at: "", period_end_at: "", status: "active" },
  floors: [],
  tables: [
    { id: "table-1", floor_id: "floor-1", floor_name: "Main", name: "1", status: "free", current_order_id: null, active: true },
    { id: "table-2", floor_id: "floor-1", floor_name: "Main", name: "2", status: "free", current_order_id: null, active: false }
  ],
  productionUnits: [
    { id: "kitchen", name: "Kitchen", active: true, kds_enabled: true },
    { id: "bar", name: "Bar", active: true, kds_enabled: false }
  ],
  menuItems: [
    {
      id: "item-1",
      name: "Paneer Tikka",
      price_paise: 25_000,
      production_unit_id: "kitchen",
      production_unit_name: "Kitchen",
      sale_group_id: "sg-food",
      sale_group_name: "Food",
      sale_group_kind: "food",
      active: 1
    },
    {
      id: "item-2",
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
  ]
};

const currentOrder: HubOrder = {
  order: { id: "order-1", status: "open", table_id: "table-1", pax: 2 },
  items: [
    { id: "sent-1", menu_item_id: "item-1", name_snapshot: "Paneer Tikka", unit_price_paise: 25_000, quantity: 2, status: "sent" },
    { id: "cancelled-1", menu_item_id: "item-1", name_snapshot: "Paneer Tikka", unit_price_paise: 25_000, quantity: 1, status: "cancelled" }
  ],
  bill: null
};

describe("mobile service view model", () => {
  it("derives active tables, totals, menu filters, and KDS units", () => {
    const viewModel = getMobileServiceViewModel({
      bootstrap,
      selectedTableId: "table-1",
      currentOrder,
      draftItems: [{ menuItemId: "item-2", menuItemVariantId: "v180", quantity: 1 }],
      menuSearch: "whisky",
      menuGroupFilter: "alcohol"
    });

    expect(viewModel.selectedTable?.id).toBe("table-1");
    expect(viewModel.activeTables.map((table) => table.id)).toEqual(["table-1"]);
    expect(viewModel.sentItems.map((item) => item.id)).toEqual(["sent-1"]);
    expect(viewModel.draftTotal).toBe(45_000);
    expect(viewModel.tableTotal).toBe(95_000);
    expect(viewModel.hasNewItems).toBe(true);
    expect(viewModel.saleGroupFilters).toEqual([
      ["food", "Food"],
      ["alcohol", "Alcohol"]
    ]);
    expect(viewModel.visibleMenu.map((item) => item.id)).toEqual(["item-2"]);
    expect(viewModel.activeKdsUnits.map((unit) => unit.id)).toEqual(["kitchen"]);
  });
});
