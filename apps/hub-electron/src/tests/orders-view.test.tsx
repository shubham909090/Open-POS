// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../renderer/hub-api.js";

describe("hub orders view layout", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("collapses the menu by default and keeps the selected table workspace primary", async () => {
    const { OrdersView, useHubStore } = await importOrdersView();
    useHubStore.setState({ selectedTableId: "table-t1", orderPanel: "sent", menuSearch: "", drafts: {} });

    const { container } = render(<OrdersView bootstrap={bootstrap()} setNotice={vi.fn()} requestManagerApproval={vi.fn()} />);

    expect(container.querySelector(".order-workspace-grid.menu-collapsed")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open menu" })).not.toBeNull();
    expect(screen.getByTestId("selected-workspace")).not.toBeNull();
    expect(screen.queryByPlaceholderText("Search dish")).toBeNull();
  });

  it("expands and closes the menu browser from the compact menu rail", async () => {
    const { OrdersView, useHubStore } = await importOrdersView();
    useHubStore.setState({ selectedTableId: "table-t1", orderPanel: "new", menuSearch: "", drafts: {} });

    const { container } = render(<OrdersView bootstrap={bootstrap()} setNotice={vi.fn()} requestManagerApproval={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(container.querySelector(".order-workspace-grid.menu-open")).not.toBeNull();
    expect(screen.getByPlaceholderText("Search dish")).not.toBeNull();
    expect(screen.getByText("Imported Whisky")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));

    expect(container.querySelector(".order-workspace-grid.menu-collapsed")).not.toBeNull();
    expect(screen.queryByPlaceholderText("Search dish")).toBeNull();
  });
});

async function importOrdersView() {
  vi.doMock("../renderer/components/orders/table-workspace.js", () => ({
    TableWorkspace: () => <section data-testid="selected-workspace">Selected workspace</section>
  }));
  const [{ OrdersView }, { useHubStore }] = await Promise.all([
    import("../renderer/components/orders/orders-view.js"),
    import("../renderer/store.js")
  ]);
  return { OrdersView, useHubStore };
}

function bootstrap(): Bootstrap {
  return {
    currentBusinessDay: { id: "day-1", business_date: "2026-05-16", period_start_at: "", period_end_at: "", status: "active" },
    floors: [{ id: "floor-1", name: "Main", active: true }],
    tables: [
      {
        id: "table-t1",
        floor_id: "floor-1",
        floor_name: "Main",
        name: "T1",
        active: true,
        status: "running",
        current_order_id: "order-1",
        occupied_at: "",
        current_order_total_paise: 40_000,
        sent_item_count: 1
      }
    ],
    productionUnits: [],
    saleGroups: [{ id: "sg-alcohol", name: "Alcohol", kind: "alcohol", report_label: "Alcohol", ticket_label: "BOT", tax_components_json: "[]", default_production_unit_id: "bar", active: true }],
    menuItems: [
      {
        id: "item-whisky",
        name: "Imported Whisky",
        price_paise: 4_000,
        production_unit_id: "bar",
        production_unit_name: "Bar",
        sale_group_id: "sg-alcohol",
        sale_group_name: "Alcohol",
        sale_group_kind: "alcohol",
        ticket_label: "BOT" as const,
        active: true,
        variants: [{ id: "v30", menu_item_id: "item-whisky", label: "30 ml", kind: "shot", price_paise: 4_000, volume_ml: 30, inventory_action: "large_ml", sort_order: 0, active: true }]
      }
    ],
    printJobs: [],
    syncStatus: {}
  };
}
