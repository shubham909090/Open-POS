// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTableServiceActions } from "../hooks/use-table-service-actions";
import type { HubClient, HubOrder } from "../lib/hub-client";

vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const orderA: HubOrder = {
  order: { id: "order-A", table_id: "A", status: "billed", pax: 2 }, items: [],
  bill: { id: "bill-A", total_paise: 10000, final_total_paise: 10000, status: "pending" },
};

function inputs() {
  const methods = { generateBill: vi.fn(), updateOrderState: vi.fn(), reprintBill: vi.fn(), markBillNc: vi.fn(), settleBill: vi.fn(), reviseBill: vi.fn(), moveTable: vi.fn(), moveItems: vi.fn(), submitOrder: vi.fn() };
  const props: Parameters<typeof useTableServiceActions>[0] = {
    client: methods as unknown as HubClient, connection: "online", currentOrder: orderA, deviceName: "Captain",
    hasNewItems: true, items: [{ menuItemId: "dish-B", quantity: 1 }], menuItems: [], operationKey: () => "key", clearOperationKey: vi.fn(), pax: "2",
    persistDraft: vi.fn(), clearSelectedTableDraft: vi.fn(), refresh: vi.fn(), loadTableOrder: vi.fn(),
    chooseBillPrinter: vi.fn().mockResolvedValue("default"), selectedTableId: "B", selectedTableName: "B", isCurrentSelection: () => true,
    sentItems: [], sending: false, setMessage: vi.fn(), setMode: vi.fn(), setSelectedTableId: vi.fn(), setSending: vi.fn(),
  };
  return { methods, props };
}

it("blocks all financial and sent-order mutations when the loaded order belongs to another table", async () => {
  const { methods, props } = inputs();
  const { result } = renderHook(() => useTableServiceActions(props));
  await act(async () => {
    await result.current.generateBillForSelectedTable();
    await result.current.saveOrderStateForSelectedTable("save", []);
    await result.current.reprintSelectedBill("1234", "test reason");
    await result.current.markSelectedBillNc("1234", "test reason");
    await result.current.settleSelectedBill({ discountType: "amount", discountValue: 0, tipPaise: 0, payments: [{ method: "cash", amountPaise: 10000 }] });
    await result.current.reviseSelectedBill("1234", "test reason");
    await result.current.shiftTable("C");
    await result.current.shiftItem("A-item", 1, "C");
  });
  for (const method of Object.values(methods)) expect(method).not.toHaveBeenCalled();
  expect(props.chooseBillPrinter).not.toHaveBeenCalled();
  expect(props.setMessage).toHaveBeenCalledWith("Reload this table before continuing.");
});

it("rechecks ownership after an async printer choice before generating a bill", async () => {
  const { methods, props } = inputs();
  let current = true;
  let choose!: (slot: "default") => void;
  props.selectedTableId = "A"; props.isCurrentSelection = () => current;
  props.chooseBillPrinter = vi.fn(() => new Promise<"default">((resolve) => { choose = resolve; }));
  const { result } = renderHook(() => useTableServiceActions(props));
  let pending!: Promise<void>;
  act(() => { pending = result.current.generateBillForSelectedTable(); });
  current = false;
  await act(async () => { choose("default"); await pending; });
  expect(methods.generateBill).not.toHaveBeenCalled();
});
