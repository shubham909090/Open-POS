// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MenuItemRow } from "../components/menu-screen";
import { KitchenScreen } from "../components/kitchen-screen";
import { CaptainBillingPanel } from "../components/billing-panel";
import type { HubBootstrap, HubOrder, KdsTicket } from "../lib/hub-client";

vi.mock("react-native", () => ({
  View: ({ children }: any) => createElement("div", null, children),
  Text: ({ children, accessibilityLabel }: any) => createElement("span", { "aria-label": accessibilityLabel }, children),
  ScrollView: ({ children }: any) => createElement("div", null, children),
  TextInput: ({ accessibilityLabel, placeholder, value, onChangeText }: any) => createElement("input", { "aria-label": accessibilityLabel, placeholder, value, onChange: (event: any) => onChangeText?.(event.target.value) }),
  ActivityIndicator: () => null,
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  StyleSheet: { create: (value: unknown) => value },
  Platform: { OS: "android" },
  StatusBar: { currentHeight: 0 },
}));
vi.mock("../components/pressable", () => ({ Pressable: ({ children, onPress, disabled, accessibilityLabel }: any) => createElement("button", { onClick: onPress, disabled, "aria-label": accessibilityLabel }, children) }));
vi.mock("../components/form-modal", () => ({ FormModal: ({ visible, children }: any) => visible ? children : null }));
vi.mock("../styles/app-styles", () => ({ styles: {}, palette: {} }));
vi.mock("lucide-react-native", () => ({ Plus: () => null, Search: () => null, X: () => null }));
vi.mock("../components/app-shell", () => ({
  LabeledMoneyInput: ({ label, value, onChange }: any) => createElement("input", { "aria-label": label, value, onChange: (event: any) => onChange(event.target.value) }),
  UncontrolledInput: ({ label, defaultValue, onChangeText }: any) => createElement("input", { "aria-label": label, defaultValue, onChange: (event: any) => onChangeText(event.target.value) }),
}));
afterEach(cleanup);
const dish = { id: "dish", name: "Garden vegetable curry", price_paise: 14000, sale_group_kind: "food" } as HubBootstrap["menuItems"][number];

it("keeps the added quantity next to the dish and sends the exact selected variant", () => {
  const onAdd = vi.fn();
  render(<MenuItemRow menuItem={{ ...dish, variants: [{ id: "half", label: "Half", kind: "half", price_paise: 9000, active: true, volume_ml: null, inventory_action: "none" }, { id: "full", label: "Full", kind: "full", price_paise: 14000, active: true, volume_ml: null, inventory_action: "none" }] }} draftQuantity={3} draftSelectionLabel="1 Half, 2 Full" onAddItem={onAdd} />);
  expect(screen.getByLabelText("3 selected").textContent).toBe("3×");
  fireEvent.click(screen.getByRole("button", { name: "Add Garden vegetable curry, Full, Rs 140" }));
  expect(onAdd).toHaveBeenCalledWith("dish", "full");
  expect(screen.getByText("Added 1 Half, 2 Full")).toBeTruthy();
});

it("does not offer unavailable alcohol for ordering", () => {
  render(<MenuItemRow menuItem={{ ...dish, sale_group_kind: "alcohol", variants: [] }} onAddItem={vi.fn()} />);
  expect(screen.getByText("Unavailable")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("requires a payment choice and keeps split editing on demand without losing amounts", () => {
  const settle = vi.fn();
  const order = { order: { id: "order", table_id: "M2" }, items: [], bill: { id: "bill", total_paise: 14000, paid_paise: 0 }, payments: [] } as unknown as HubOrder;
  render(<CaptainBillingPanel canBill currentOrder={order} hasNewItems={false} sending={false} onGenerateBill={vi.fn()} onReprintBill={vi.fn()} onMarkNc={vi.fn()} onReviseBill={vi.fn()} onSettleBill={settle} />);
  expect((screen.getByRole("button", { name: "Record Rs 140" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByLabelText("CASH")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "UPI" }));
  fireEvent.click(screen.getByRole("button", { name: /Split payment \/ reference\+$/ }));
  expect((screen.getByLabelText("UPI") as HTMLInputElement).value).toBe("140");
  fireEvent.change(screen.getByLabelText("CASH"), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText("UPI"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: /Split payment \/ reference−$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Record Rs 140" }));
  expect(settle).toHaveBeenCalledWith({ discountType: "amount", discountValue: 0, tipPaise: 0, payments: [{ method: "cash", amountPaise: 4000, reference: undefined }, { method: "upi", amountPaise: 10000, reference: undefined }] });
});

it("keeps existing partially paid billing available when a local draft cannot be revised", () => {
  const order = { order: { id: "order", table_id: "M2" }, items: [], bill: { id: "bill", total_paise: 14000, paid_paise: 10000 }, payments: [] } as unknown as HubOrder;
  render(<CaptainBillingPanel canBill currentOrder={order} hasNewItems sending={false} onGenerateBill={vi.fn()} onReprintBill={vi.fn()} onMarkNc={vi.fn()} onReviseBill={vi.fn()} onSettleBill={vi.fn()} />);
  expect(screen.getByText("Current bill · new items excluded.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "UPI" }));
  expect((screen.getByRole("button", { name: "Record Rs 40" }) as HTMLButtonElement).disabled).toBe(false);
});
it("offers revision instead of settling an outdated unpaid bill when new dishes are waiting", () => {
  const order = { order: { id: "order", table_id: "M2" }, items: [], bill: { id: "bill", total_paise: 14000, paid_paise: 0 }, payments: [] } as unknown as HubOrder;
  render(<CaptainBillingPanel canBill currentOrder={order} hasNewItems sending={false} onGenerateBill={vi.fn()} onReprintBill={vi.fn()} onMarkNc={vi.fn()} onReviseBill={vi.fn()} onSettleBill={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Revise bill" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Record Rs/ })).toBeNull();
});

const kitchenTicket = (type: KdsTicket["type"], quantities: number[]): KdsTicket => ({ id: "notice", sequence: 14, type, status: "queued", table_name: "M1", items: quantities.map((quantity_delta) => ({ name_snapshot: "Review dish", quantity_delta, note_snapshot: quantity_delta === 0 ? "No chilli" : null })) } as KdsTicket);
const kitchenProps = { units: [{ id: "bar", name: "Bar" }], selectedUnitId: "bar", loading: false, sending: false, onSelectUnit: vi.fn() };
it.each([
  ["cancelled", [-2]],
  ["partial_cancel", [-1, 0]],
  ["modified", [0]],
  [undefined, [-1]],
] as const)("acknowledges %s kitchen changes without offering preparation", (type, quantities) => {
  const changeStatus = vi.fn();
  render(<KitchenScreen {...kitchenProps} tickets={[kitchenTicket(type, [...quantities])]} onStatusChange={changeStatus} />);
  expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Ready" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Acknowledge ticket 14" }));
  expect(changeStatus).toHaveBeenCalledWith("notice", "served");
});
it("still prepares mixed modifications that contain positive dishes", () => {
  const changeStatus = vi.fn();
  render(<KitchenScreen {...kitchenProps} tickets={[kitchenTicket("modified", [-1, 0, 2])]} onStatusChange={changeStatus} />);
  expect(screen.queryByRole("button", { name: /Acknowledge/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(changeStatus).toHaveBeenCalledWith("notice", "preparing");
  fireEvent.click(screen.getByRole("button", { name: "Ready" }));
  expect(changeStatus).toHaveBeenCalledWith("notice", "ready");
});
it("disables duplicate kitchen acknowledgment while saving or already served", () => {
  const ticket = kitchenTicket("cancelled", [-1]);
  const { rerender } = render(<KitchenScreen {...kitchenProps} sending tickets={[ticket]} onStatusChange={vi.fn()} />);
  expect((screen.getByRole("button", { name: "Acknowledge ticket 14" }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<KitchenScreen {...kitchenProps} tickets={[{ ...ticket, status: "served" }]} onStatusChange={vi.fn()} />);
  expect((screen.getByRole("button", { name: "Acknowledge ticket 14" }) as HTMLButtonElement).disabled).toBe(true);
});
