// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const submitOrderMock = vi.fn();

describe("hub table workspace send actions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
    submitOrderMock.mockReset();
  });

  it("shows KOT and Print and KOT buttons and sends the selected print mode", async () => {
    const { TableWorkspace, useHubStore } = await importWorkspace();
    submitOrderMock.mockResolvedValue({ orderId: "order-1", kotIds: ["kot-1"], printJobIds: [] });
    seedDraft(useHubStore);

    renderWorkspace(TableWorkspace);

    fireEvent.click(await screen.findByRole("button", { name: "KOT F3" }));

    await waitFor(() => expect(submitOrderMock).toHaveBeenCalledWith(expect.objectContaining({ printMode: "kot" }), expect.any(String)));
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
});

async function importWorkspace() {
  vi.doMock("../renderer/hub-api.js", () => ({
    hubApi: {
      tableOrder: vi.fn().mockResolvedValue(null),
      submitOrder: submitOrderMock
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
          quantity: 1
        }
      }
    }
  });
}

function renderWorkspace(TableWorkspace: typeof import("../renderer/components/orders/table-workspace.js").TableWorkspace) {
  return render(wrapWorkspace(TableWorkspace));
}

function wrapWorkspace(TableWorkspace: typeof import("../renderer/components/orders/table-workspace.js").TableWorkspace) {
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
          saleGroups: [],
          menuItems: [],
          printJobs: [],
          syncStatus: {}
        }}
        setNotice={vi.fn()}
        requestManagerApproval={vi.fn()}
      />
    </QueryClientProvider>
  );
}
