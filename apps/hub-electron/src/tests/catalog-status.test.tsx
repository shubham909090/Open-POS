// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DishesCard } from "../renderer/components/setup/dishes-card.js";
import { AlcoholItemsPanel } from "../renderer/components/alcohol/alcohol-items-panel.js";
import type { AlcoholCatalog, Bootstrap, MenuItem } from "../renderer/hub-api.js";

function fixture(): Bootstrap {
  const base: MenuItem = { id: "dal", name: "Dal Fry", price_paise: 20000, production_unit_id: null, production_unit_name: null, sale_group_id: "food", sale_group_name: "Food", sale_group_kind: "food", ticket_label: "KOT", active: false };
  return {
    currentBusinessDay: { id: "day", business_date: "2026-09-10", period_start_at: "", period_end_at: "", status: "active" },
    floors: [], tables: [], productionUnits: [], saleGroups: [], printJobs: [], syncStatus: {},
    menuItems: [base, { ...base, id: "paneer", name: "Paneer Tikka", active: true }],
  };
}

describe("catalog status views", () => {
  afterEach(cleanup);
  it("shows active dishes by default and isolates disabled dishes", () => {
    const bootstrap = fixture();
    const dishes = bootstrap.menuItems.filter((item) => item.sale_group_kind !== "alcohol");
    render(<DishesCard bootstrap={bootstrap} rawSetupDishItems={dishes} setupDishItems={dishes}
      dishListSearch="" setDishListSearch={vi.fn()} dishName="" setDishName={vi.fn()} dishPrice="" setDishPrice={vi.fn()}
      dishUnit="" setDishUnit={vi.fn()} dishGroup="sg-food" setDishGroup={vi.fn()} dishSaleGroups={bootstrap.saleGroups}
      dishPricePaise={0} createDishPending={false} importDishesPending={false} dishImportResult={null}
      onCreateDish={vi.fn()} onImportDishes={vi.fn()} invalidate={vi.fn()} setNotice={vi.fn()} requestManagerApproval={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Dishes.*Open/ }));
    expect(screen.queryByText("Dal Fry")).toBeNull();
    expect(screen.getByText("Paneer Tikka")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disabled (1)" }));
    expect(screen.getByText("Dal Fry")).toBeTruthy();
    expect(screen.queryByText("Paneer Tikka")).toBeNull();
    expect(screen.getByRole("button", { name: "Enable" })).toBeTruthy();
  });

  it("separates alcohol and preserves disabled prices for owner inspection", () => {
    const bootstrap = fixture();
    const base = bootstrap.menuItems[0] as MenuItem;
    const item = (active: boolean): AlcoholCatalog["items"][number] => ({
      ...base, id: active ? "active" : "disabled", name: active ? "Current Whisky" : "Previous Whisky", active,
      type: "plain_liquor", large_bottle_ml: 750, small_bottle_ml: 180, sealed_large_count: 0, open_large_ml: 0, sealed_small_count: 0, recipeIngredients: [],
      variants: [{ id: active ? "v1" : "v2", menu_item_id: active ? "active" : "disabled", label: "30 ml", kind: "shot", price_paise: 15000, volume_ml: 30, inventory_action: "large_ml", sort_order: 0, active }],
    });
    render(<QueryClientProvider client={new QueryClient()}><AlcoholItemsPanel bootstrap={bootstrap} catalog={{ items: [item(true), item(false)], storage: [] }} invalidate={vi.fn()} setNotice={vi.fn()} requestManagerApproval={vi.fn()} /></QueryClientProvider>);
    expect(screen.getByText("Current Whisky")).toBeTruthy();
    expect(screen.queryByText("Previous Whisky")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Disabled (1)" }));
    expect(screen.getByText("Previous Whisky")).toBeTruthy();
    expect(screen.queryByText("Current Whisky")).toBeNull();
    expect(screen.getByText("30 ml ₹150.00")).toBeTruthy();
  });
});
