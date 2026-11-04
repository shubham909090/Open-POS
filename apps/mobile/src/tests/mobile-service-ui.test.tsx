// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MenuItemRow } from "../components/menu-screen";
import { CaptainBillingPanel } from "../components/billing-panel";
import type { HubBootstrap, HubOrder } from "../lib/hub-client";

vi.mock("react-native", () => ({
  View: ({ children }: any) => createElement("div", null, children),
  Text: ({ children, accessibilityLabel }: any) => createElement("span", { "aria-label": accessibilityLabel }, children),
  ScrollView: ({ children }: any) => createElement("div", null, children),
  TextInput: ({ accessibilityLabel, placeholder, value, onChangeText }: any) => createElement("input", { "aria-label": accessibilityLabel, placeholder, value, onChange: (event: any) => onChangeText?.(event.target.value) }),
  ActivityIndicator: () => null,
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
