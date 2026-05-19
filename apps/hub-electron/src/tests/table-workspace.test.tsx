// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const submitOrderMock = vi.fn();
const tableOrderMock = vi.fn();
const updateOrderStateMock = vi.fn();
const billPrintersMock = vi.fn();

describe("hub table workspace send actions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
    submitOrderMock.mockReset();
    tableOrderMock.mockReset();
    updateOrderStateMock.mockReset();
    billPrintersMock.mockReset();
  });

  it("shows KOT and Print and KOT buttons and sends the selected print mode", async () => {
    const { TableWorkspace, useHubStore } = await importWorkspace();
    submitOrderMock.mockResolvedValue({ orderId: "order-1", kotIds: ["kot-1"], printJobIds: [] });
    seedDraft(useHubStore);

    renderWorkspace(TableWorkspace);

    fireEvent.click(await screen.findByRole("button", { name: "KOT F3" }));

    await waitFor(() => expect(submitOrderMock).toHaveBeenCalledWith(expect.objectContaining({ printMode: "kot" }), expect.any(String)));
  });

  it("focuses the inline add-dish search when a table opens on new order", async () => {
    const { TableWorkspace, useHubStore } = await importWorkspace();
    useHubStore.setState({ selectedTableId: "table-t1", orderPanel: "new", drafts: {} });

    renderWorkspace(TableWorkspace);

    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText("Search menu item")));
  });

  it("does not steal focus for sent-item editor when a table opens outside new order", async () => {
    const { TableWorkspace, useHubStore } = await importWorkspace();
    tableOrderMock.mockResolvedValue(tableOrder(1));
    useHubStore.setState({ selectedTableId: "table-t1", orderPanel: "sent", drafts: {} });

    renderWorkspace(TableWorkspace);

    await screen.findByText("Edited total");
    expect(document.activeElement).not.toBe(screen.getByPlaceholderText("Search menu item"));
  });

  it("uses F6 for Print and KOT only when send buttons are visible and enabled", async () => {
    const { TableWorkspace, useHubStore } = await importWorkspace();
    submitOrderMock.mockResolvedValue({ orderId: "order-1", kotIds: ["kot-1"], printJobIds: ["print-1"] });
    seedDraft(useHubStore);

    const { rerender } = renderWorkspace(TableWorkspace);
    fireEvent.keyDown(window, { key: "F6" });
    await waitFor(() => expect(submitOrderMock).toHaveBeenCalledWith(expect.objectContaining({ printMode: "kot_print" }), expect.any(String)));

    submitOrderMock.mockClear();
    useHubStore.setState({ orderPanel: "sent" });
    rerender(wrapWorkspace(TableWorkspace));
    fireEvent.keyDown(window, { key: "F3" });

    expect(submitOrderMock).not.toHaveBeenCalled();
  });

  it("keeps compact alcohol add actions and hides table-state save buttons until the draft is dirty", async () => {
    const { TableWorkspace, useHubStore } = await importWorkspace();
    let quantity = 1;
    tableOrderMock.mockImplementation(() => Promise.resolve(tableOrder(quantity)));
    updateOrderStateMock.mockImplementation(async () => {
      quantity = 2;
      return { orderId: "order-1", printJobIds: [], kotIds: [] };
    });
    const nativeConfirm = vi.spyOn(window, "confirm").mockImplementation(() => {
      throw new Error("Native confirm must not be used in Electron renderer");
    });
    useHubStore.setState({ selectedTableId: "table-t1", orderPanel: "sent", drafts: {} });

    const { container } = renderWorkspace(TableWorkspace);

    await screen.findByText("Edited total");
    expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull();
    expect(screen.queryByText("Saved")).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search menu item"), { target: { value: "whisky" } });
    expect(await screen.findByText("30 ml ₹40")).not.toBeNull();
    expect(screen.getByText("180 ml ₹250")).not.toBeNull();
    expect(screen.getByText("750 ml ₹900")).not.toBeNull();
    expect(screen.queryByText("Add")).toBeNull();
    expect(container.querySelector(".state-search-icon svg")).not.toBeNull();
    expect(container.querySelector(".state-search-actions.menu-variant-buttons")).not.toBeNull();

    fireEvent.click(screen.getByText("30 ml ₹40"));
    expect(await screen.findByRole("button", { name: /^Save$/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save and print" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(await screen.findByRole("dialog", { name: "Save without printing?" })).not.toBeNull();
    expect(screen.getByText("Save these table changes without printing a modification KOT/BOT?")).not.toBeNull();
    expect(nativeConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save without print" }));
    await waitFor(() => expect(updateOrderStateMock).toHaveBeenCalledWith("order-1", expect.objectContaining({ saveMode: "save" }), expect.any(String)));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull());
  });

  it("cancels the custom save-without-print confirmation without mutating order state", async () => {
    const { TableWorkspace, useHubStore } = await importWorkspace();
    tableOrderMock.mockResolvedValue(tableOrder(1));
    const nativeConfirm = vi.spyOn(window, "confirm").mockImplementation(() => true);
    useHubStore.setState({ selectedTableId: "table-t1", orderPanel: "sent", drafts: {} });

    renderWorkspace(TableWorkspace);

    await screen.findByText("Edited total");
    fireEvent.change(screen.getByPlaceholderText("Search menu item"), { target: { value: "whisky" } });
    fireEvent.click(await screen.findByText("30 ml ₹40"));
    fireEvent.click(await screen.findByRole("button", { name: /^Save$/ }));

    expect(await screen.findByRole("dialog", { name: "Save without printing?" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Save without printing?" })).toBeNull());
    expect(updateOrderStateMock).not.toHaveBeenCalled();
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("removes unsaved search-added state rows when their quantity returns to zero", async () => {
    const { TableWorkspace, useHubStore } = await importWorkspace();
    tableOrderMock.mockResolvedValue(tableOrder(1));
    useHubStore.setState({ selectedTableId: "table-t1", orderPanel: "sent", drafts: {} });

    renderWorkspace(TableWorkspace);

    await screen.findByText("Edited total");
    fireEvent.change(screen.getByPlaceholderText("Search menu item"), { target: { value: "whisky" } });
    fireEvent.click(await screen.findByText("30 ml ₹40"));

    expect(await screen.findByText("Imported Whisky 30 ml")).not.toBeNull();
    const addedRow = screen.getByText("Imported Whisky 30 ml").closest(".line-row");
    const minus = addedRow?.querySelector("button");
    expect(minus).not.toBeNull();
    fireEvent.click(minus as HTMLButtonElement);

    expect(screen.queryByText("Imported Whisky 30 ml")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull();
    expect(screen.queryByText("Saved")).not.toBeNull();
  });

  it("does not allow saving a running table edit with zero active items", async () => {
    const { TableWorkspace, useHubStore } = await importWorkspace();
    const setNotice = vi.fn();
    tableOrderMock.mockResolvedValue(tableOrder(1));
    useHubStore.setState({ selectedTableId: "table-t1", orderPanel: "sent", drafts: {} });

    renderWorkspace(TableWorkspace, setNotice);

    await screen.findByText("Edited total");
    const row = screen.getByText("bhaji").closest(".line-row");
    const minus = row?.querySelector("button");
    expect(minus).not.toBeNull();
    fireEvent.click(minus as HTMLButtonElement);

    expect(await screen.findByText("Running table must keep at least one item. Use Cancel order instead.")).not.toBeNull();
    expect((screen.getByRole("button", { name: /^Save$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(updateOrderStateMock).not.toHaveBeenCalled();
    expect(setNotice).not.toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("Table state saved") }));
  });

  it("shows category icons on new draft and sent item rows", async () => {
    const { TableWorkspace, useHubStore } = await importWorkspace();
    tableOrderMock.mockResolvedValue(tableOrder(1));
    seedDraft(useHubStore);

    const { container, rerender } = renderWorkspace(TableWorkspace);

    expect(await screen.findByText("Dal Fry")).not.toBeNull();
    expect(container.querySelector(".line-category-icon svg")).not.toBeNull();

    useHubStore.setState({ orderPanel: "sent" });
    rerender(wrapWorkspace(TableWorkspace));

    expect(await screen.findByText("bhaji")).not.toBeNull();
    expect(container.querySelector(".line-category-icon svg")).not.toBeNull();
  });

  it("renders menu alcohol variants as one compact action group without Add text", async () => {
    const { MenuCard } = await import("../renderer/components/orders/menu-card.js");
    const onAdd = vi.fn();
    const { container } = render(<MenuCard item={alcoholMenuItem()} onAdd={onAdd} />);

    expect(screen.getByText("30 ml ₹40")).not.toBeNull();
    expect(screen.getByText("180 ml ₹250")).not.toBeNull();
    expect(screen.getByText("750 ml ₹900")).not.toBeNull();
    expect(screen.queryByText("Add")).toBeNull();
    expect(container.querySelector(".menu-variant-buttons")).not.toBeNull();
  });
});

async function importWorkspace() {
  billPrintersMock.mockResolvedValue({
    default: { label: "Main bill printer", printerMode: "system", printerName: "EPSON", printerPort: 9100, configured: true },
    alternate: { label: "Second bill printer", printerMode: "system", printerPort: 9100, configured: false }
  });
  vi.doMock("../renderer/hub-api.js", () => ({
    hubApi: {
      billPrinters: billPrintersMock,
      tableOrder: tableOrderMock.mockResolvedValue(null),
      submitOrder: submitOrderMock,
      updateOrderState: updateOrderStateMock
    }
  }));
  const [{ TableWorkspace }, { useHubStore }] = await Promise.all([
    import("../renderer/components/orders/table-workspace.js"),
    import("../renderer/store.js")
  ]);
  return { TableWorkspace, useHubStore };
}

function seedDraft(useHubStore: typeof import("../renderer/store.js").useHubStore) {
  useHubStore.setState({
    selectedTableId: "table-t1",
    orderPanel: "new",
    drafts: {
      "table-t1": {
        "item-dal-fry": {
          lineKey: "item-dal-fry",
          menuItemId: "item-dal-fry",
          name: "Dal Fry",
          pricePaise: 18000,
          saleGroupId: "sg-food",
          saleGroupName: "Food",
          saleGroupKind: "food",
          quantity: 1
        }
      }
    }
  });
}

function renderWorkspace(TableWorkspace: typeof import("../renderer/components/orders/table-workspace.js").TableWorkspace, setNotice = vi.fn()) {
  return render(wrapWorkspace(TableWorkspace, setNotice));
}

function wrapWorkspace(TableWorkspace: typeof import("../renderer/components/orders/table-workspace.js").TableWorkspace, setNotice = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <TableWorkspace
        tableId="table-t1"
        tableName="T1"
        bootstrap={{
          currentBusinessDay: { id: "day-1", business_date: "2026-05-16", period_start_at: "", period_end_at: "", status: "active" },
          floors: [],
          tables: [{ id: "table-t1", floor_id: "floor-1", floor_name: "Main", name: "T1", active: true, status: "free", current_order_id: null, occupied_at: null, current_order_total_paise: 0, sent_item_count: 0 }],
          productionUnits: [],
          saleGroups: [
            { id: "sg-alcohol", name: "Alcohol", kind: "alcohol", report_label: "Alcohol", ticket_label: "BOT", tax_components_json: "[]", default_production_unit_id: "bar", active: true },
            { id: "sg-food", name: "Food", kind: "food", report_label: "Food", ticket_label: "KOT", tax_components_json: "[]", default_production_unit_id: "kitchen", active: true }
          ],
          menuItems: [alcoholMenuItem()],
          printJobs: [],
          syncStatus: {}
        }}
        setNotice={setNotice}
        requestManagerApproval={vi.fn()}
      />
    </QueryClientProvider>
  );
}

function tableOrder(quantity: number) {
  return {
    order: { id: "order-1", table_id: "table-t1", status: "open", pax: 2, captain_id: "device-1" },
    items: [
      {
        id: "oi-food",
        order_id: "order-1",
        menu_item_id: "item-bhaji",
        menu_item_variant_id: null,
        name_snapshot: "bhaji",
        unit_price_paise: 30_000,
        quantity,
        production_unit_id: "kitchen",
        sale_group_id: "sg-food",
        sale_group_name_snapshot: "Food",
        sale_group_kind_snapshot: "food",
        ticket_label_snapshot: "KOT",
        status: "sent"
      }
    ],
    bill: null,
    payments: []
  };
}

function alcoholMenuItem() {
  return {
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
    variants: [
      { id: "v30", menu_item_id: "item-whisky", label: "30 ml", kind: "shot", price_paise: 4_000, volume_ml: 30, inventory_action: "large_ml", sort_order: 0, active: true },
      { id: "v180", menu_item_id: "item-whisky", label: "180 ml", kind: "small_bottle", price_paise: 25_000, volume_ml: 180, inventory_action: "small_bottle", sort_order: 1, active: true },
      { id: "v750", menu_item_id: "item-whisky", label: "750 ml", kind: "large_bottle", price_paise: 90_000, volume_ml: 750, inventory_action: "large_bottle", sort_order: 2, active: true }
    ]
  };
}
