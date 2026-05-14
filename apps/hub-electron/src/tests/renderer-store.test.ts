import { describe, expect, it, beforeEach } from "vitest";
import { useHubStore } from "../renderer/store.js";

describe("hub UI draft store", () => {
  beforeEach(() => {
    useHubStore.setState({ selectedTableId: null, orderPanel: "new", drafts: {} });
  });

  it("keeps new order drafts separate per table and clears only the submitted table", () => {
    const dish = {
      id: "dish-1",
      name: "Dal Fry",
      price_paise: 18000,
      production_unit_id: null,
      production_unit_name: null,
      sale_group_id: "sg-food",
      sale_group_name: "Food",
      sale_group_kind: "food",
      ticket_label: "KOT" as const,
      active: true
    };

    useHubStore.getState().addDraftItem("table-1", dish);
    useHubStore.getState().addDraftItem("table-1", dish);
    useHubStore.getState().addDraftItem("table-2", dish);

    expect(useHubStore.getState().drafts["table-1"]?.["dish-1"]?.quantity).toBe(2);
    expect(useHubStore.getState().drafts["table-2"]?.["dish-1"]?.quantity).toBe(1);

    useHubStore.getState().clearDraft("table-1");

    expect(useHubStore.getState().drafts["table-1"]).toEqual({});
    expect(useHubStore.getState().drafts["table-2"]?.["dish-1"]?.quantity).toBe(1);
  });
});
