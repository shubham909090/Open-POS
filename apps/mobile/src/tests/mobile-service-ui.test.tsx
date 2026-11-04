// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Keyboard } from "react-native";
import { MenuItemRow } from "../components/menu-screen";
import { MobileUpdatePanel } from "../components/settings-panels";
import { KitchenScreen } from "../components/kitchen-screen";
import { TicketScreen } from "../components/ticket-screen";
import { BillingHistoryPanel } from "../components/billing-history-panel";
import { CaptainBillingPanel } from "../components/billing-panel";
import type { HubBootstrap, HubOrder, KdsTicket } from "../lib/hub-client";

vi.mock("react-native", () => ({
  View: ({ children, testID }: any) => createElement("div", { "data-testid": testID }, children),
  Text: ({ children, accessibilityLabel }: any) => createElement("span", { "aria-label": accessibilityLabel }, children),
  ScrollView: ({ children, testID }: any) => createElement("div", { "data-testid": testID }, children),
  TextInput: ({ accessibilityLabel, placeholder, value, onChangeText }: any) => createElement("input", { "aria-label": accessibilityLabel, placeholder, value, onChange: (event: any) => onChangeText?.(event.target.value) }),
  ActivityIndicator: () => null,
  Alert: { alert: vi.fn() },
  Keyboard: { isVisible: () => false, addListener: vi.fn(() => ({ remove: vi.fn() })), dismiss: vi.fn() },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  StyleSheet: { create: (value: unknown) => value },
  Platform: { OS: "android" },
  StatusBar: { currentHeight: 0 },
}));
vi.mock("../components/pressable", () => ({ Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityRole, accessibilityState }: any) => createElement("button", { onClick: onPress, disabled, "aria-label": accessibilityLabel, role: accessibilityRole, "aria-selected": accessibilityState?.selected }, children) }));
vi.mock("../components/form-modal", () => ({ FormModal: ({ visible, children }: any) => visible ? children : null }));
vi.mock("../styles/app-styles", () => ({ styles: {}, palette: {} }));
vi.mock("../components/brand-mark", () => ({ BrandMark: () => null, DEFAULT_BRAND_NAME: "Gaurav" }));
vi.mock("lucide-react-native", () => ({ Plus: () => null, Search: () => null, X: () => null }));
vi.mock("../components/app-shell", () => ({
  EmptyState: ({ title, text }: any) => createElement("div", null, title, text),
  SummaryBox: () => null,
  LabeledMoneyInput: ({ label, value, onChange }: any) => createElement("input", { "aria-label": label, value, onChange: (event: any) => onChange(event.target.value) }),
  UncontrolledInput: ({ label, defaultValue, onChangeText }: any) => createElement("input", { "aria-label": label, defaultValue, onChange: (event: any) => onChangeText(event.target.value) }),
}));
afterEach(cleanup);
const dish = { id: "dish", name: "Garden vegetable curry", price_paise: 14000, sale_group_kind: "food" } as HubBootstrap["menuItems"][number];

it("keeps the added quantity next to the dish and sends the exact selected variant", () => {
  const onAdd = vi.fn();
  render(<MenuItemRow menuItem={{ ...dish, variants: [{ id: "half", label: "Half", kind: "half", price_paise: 9000, active: true, volume_ml: null, inventory_action: "none" }, { id: "full", label: "Full", kind: "full", price_paise: 14000, active: true, volume_ml: null, inventory_action: "none" }] }} draftQuantity={3} draftSelectionLabel="1 Half, 2 Full" onAddItem={onAdd} />);
  expect(screen.getByLabelText("3 selected").textContent).toBe("3×");
  fireEvent.click(screen.getByRole("button", { name: "Add Garden vegetable curry, Full, ₹140" }));
  expect(onAdd).toHaveBeenCalledWith("dish", "full");
  expect(screen.getByText("Added 1 Half, 2 Full")).toBeTruthy();
});

it("does not offer unavailable alcohol for ordering", () => {
  render(<MenuItemRow menuItem={{ ...dish, sale_group_kind: "alcohol", variants: [] }} onAddItem={vi.fn()} />);
  expect(screen.getByText("Unavailable")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("offers all active liquor sizes and preserves the selected size with a long item name", () => {
  const onAdd = vi.fn();
  const name = "Reserve blended whisky with a long restaurant menu name";
  const variants = [30, 60, 180, 750].map((volume) => ({ id: `v${volume}`, kind: "shot", label: `${volume} ml`, active: true, price_paise: volume * 400, volume_ml: volume, inventory_action: "large_ml" }));
  render(<MenuItemRow menuItem={{ ...dish, name, sale_group_kind: "alcohol", variants }} onAddItem={onAdd} />);
  expect(screen.getByText(name)).toBeTruthy();
  expect(screen.getAllByRole("button")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: `Add ${name}, 750 ml, ₹3,000` }));
  expect(onAdd).toHaveBeenCalledWith("dish", "v750");
});

it("requires a payment choice and preserves numeric splits above one thousand", () => {
  const settle = vi.fn();
  const order = { order: { id: "order", table_id: "M2" }, items: [], bill: { id: "bill", total_paise: 140000, paid_paise: 0 }, payments: [] } as unknown as HubOrder;
  render(<CaptainBillingPanel canBill currentOrder={order} hasNewItems={false} sending={false} onGenerateBill={vi.fn()} onReprintBill={vi.fn()} onMarkNc={vi.fn()} onReviseBill={vi.fn()} onSettleBill={settle} />);
  expect((screen.getByRole("button", { name: "Record ₹1,400" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId("bill-details-scroll").contains(screen.getByRole("button", { name: "Record ₹1,400" }))).toBe(false);
  fireEvent.change(screen.getByLabelText("CASH amount"), { target: { value: "400" } });
  fireEvent.click(screen.getByRole("button", { name: "UPI" }));
  expect((screen.getByLabelText("UPI amount") as HTMLInputElement).value).toBe("1000");
  fireEvent.click(screen.getByRole("button", { name: "Record ₹1,400" }));
  expect(settle).toHaveBeenCalledWith({ discountType: "amount", discountValue: 0, tipPaise: 0, payments: [{ method: "cash", amountPaise: 40000, reference: undefined }, { method: "upi", amountPaise: 100000, reference: undefined }] });
});

it("keeps existing partially paid billing available when a local draft cannot be revised", () => {
  const order = { order: { id: "order", table_id: "M2" }, items: [], bill: { id: "bill", total_paise: 14000, paid_paise: 10000 }, payments: [] } as unknown as HubOrder;
  render(<CaptainBillingPanel canBill currentOrder={order} hasNewItems sending={false} onGenerateBill={vi.fn()} onReprintBill={vi.fn()} onMarkNc={vi.fn()} onReviseBill={vi.fn()} onSettleBill={vi.fn()} />);
  expect(screen.getByText("Current bill · new items excluded.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "UPI" }));
  expect((screen.getByRole("button", { name: "Record ₹40" }) as HTMLButtonElement).disabled).toBe(false);
});
it("offers revision instead of settling an outdated unpaid bill when new dishes are waiting", () => {
  const order = { order: { id: "order", table_id: "M2" }, items: [], bill: { id: "bill", total_paise: 14000, paid_paise: 0 }, payments: [] } as unknown as HubOrder;
  render(<CaptainBillingPanel canBill currentOrder={order} hasNewItems sending={false} onGenerateBill={vi.fn()} onReprintBill={vi.fn()} onMarkNc={vi.fn()} onReviseBill={vi.fn()} onSettleBill={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Revise bill" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Record ₹/ })).toBeNull();
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

const ticketProps = { selectedTableName: "M2", selectedTableId: "M2", deviceName: "Captain", pax: "2", items: [{ menuItemId: "dish", quantity: 1 }], sentItems: [{ id: "sent", menu_item_id: "dish", quantity: 1, unit_price_paise: 14000, name_snapshot: dish.name }], menuItems: [dish], tables: [], floors: [], tableOrder: "name", draftTotal: 14000, tableTotal: 14000, currentOrder: { order: { id: "order", table_id: "M2" }, items: [], bill: null, payments: [] }, connection: "online", sending: false, canShift: true, canBill: true, onPaxChange: vi.fn(), onChangeQty: vi.fn(), onChangeItemNote: vi.fn(), onShiftTable: vi.fn(), onShiftItem: vi.fn(), onGenerateBill: vi.fn(), onSaveOrderState: vi.fn(), onReprintBill: vi.fn(), onMarkNc: vi.fn(), onReviseBill: vi.fn(), onSettleBill: vi.fn(), onSubmit: vi.fn() } as any;
it("keeps KOT actions on New, bill actions on Bill, and transfer on Sent", () => {
  render(<TicketScreen {...ticketProps} />);
  expect(screen.getByRole("button", { name: "Send KOT" })).toBeTruthy();
  expect(screen.getByTestId("new-items-scroll").contains(screen.getByRole("button", { name: "Send KOT" }))).toBe(false);
  expect(screen.queryByRole("button", { name: "Print bill" })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Bill" }));
  expect(screen.queryByRole("button", { name: "Send KOT" })).toBeNull();
  expect(screen.getByRole("button", { name: "Print bill" })).toBeTruthy();
  expect(screen.getByTestId("bill-details-scroll").contains(screen.getByRole("button", { name: "Print bill" }))).toBe(false);
  fireEvent.click(screen.getByRole("tab", { name: "Sent · 1" }));
  expect(screen.getByRole("button", { name: "Move table or items" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Print bill" })).toBeNull();
});
it("keeps history amounts above one thousand editable and submits exact paise", async () => {
  const save = vi.fn().mockResolvedValue(true);
  const summary = { businessDay: { business_date: "2026-11-04" }, billCount: 1, finalSalesPaise: 140000, cashPaymentsPaise: 40000, upiPaymentsPaise: 100000, cardPaymentsPaise: 0, billSummaries: [{ billId: "paid", billNumber: 12, tableName: "M2", finalTotalPaise: 140000, totalPaise: 140000, paidPaise: 140000, discountPaise: 0, tipPaise: 0, status: "paid", createdAt: new Date().toISOString(), payments: [{ method: "cash", amountPaise: 40000 }, { method: "upi", amountPaise: 100000, reference: "original" }], items: [{ orderItemId: "sent", menuItemId: "dish", name: dish.name, quantity: 1, unitPricePaise: 140000 }] }] } as any;
  render(<BillingHistoryPanel currentSummary={summary} dailyReports={[]} selectedHistoryDayId={null} selectedHistoryDetail={null} menuItems={[dish]} sending={false} actionMessage="" onHistoryPrint={vi.fn()} onHistoryEdit={save} onSelectHistoryDay={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect((screen.getByLabelText("Payment 2 amount") as HTMLInputElement).value).toBe("1000");
  fireEvent.change(screen.getByLabelText("Master PIN"), { target: { value: "9876" } });
  fireEvent.change(screen.getByLabelText("Payment 1 amount"), { target: { value: "1400" } });
  fireEvent.change(screen.getByLabelText("Payment 2 amount"), { target: { value: "1..2" } });
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Enter valid payment amounts with up to two decimal places.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Payment 1 amount"), { target: { value: "400" } });
  fireEvent.change(screen.getByLabelText("Payment 2 amount"), { target: { value: "1000" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith("paid", expect.any(Array), "", "9876", "save", [{ method: "cash", amountPaise: 40000 }, { method: "upi", amountPaise: 100000, reference: "original" }]);
});

it.each([
  ["available", "Version 0.1.16 available", "Download and install", "downloadAndInstall"],
  ["downloading", "Downloading version 0.1.16 · 42%", "Cancel download", "cancel"],
  ["verifying", "Verifying…", "Cancel download", "cancel"],
  ["ready", "Version 0.1.16 ready", "Install update", "retryInstall"],
  ["installer_opened", "Confirm installation in Android.", "Open installer", "retryInstall"],
  ["error", "Download failed", "Try again", "retryInstall"],
] as const)("renders supported update %s state and routes its action", (status, headline, label, action) => {
  const update = { supported: true, currentVersion: "0.1.15", availableVersion: "0.1.16", progress: 0.42, status, error: "Download failed", downloadAndInstall: vi.fn(), cancel: vi.fn(), retryInstall: vi.fn(), openInstallPermission: vi.fn() } as any;
  render(<MobileUpdatePanel update={update} />);
  expect(screen.getByText(headline)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(update[action]).toHaveBeenCalledOnce();
});

it("keeps the only variant label and groups its display price", () => {
  const onAdd = vi.fn();
  render(<MenuItemRow menuItem={{ ...dish, name: "Single bottle", variants: [{ id: "bottle", kind: "large_bottle", label: "750 ml", active: true, price_paise: 210000 } as any] }} onAddItem={onAdd} />);
  fireEvent.click(screen.getByRole("button", { name: "Add Single bottle, 750 ml ₹2,100" }));
  expect(onAdd).toHaveBeenCalledWith("dish", "bottle");
});

it("gives keyboard editing space and restores the contextual commit after dismissal", () => {
  render(<TicketScreen {...ticketProps} />);
  act(() => { for (const [event, listener] of vi.mocked(Keyboard.addListener).mock.calls) if (event === "keyboardDidShow") listener({} as any); });
  expect(screen.queryByRole("button", { name: "Send KOT" })).toBeNull();
  expect(screen.queryByLabelText("Guests")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Done editing" }));
  expect(Keyboard.dismiss).toHaveBeenCalled();
  act(() => { for (const [event, listener] of vi.mocked(Keyboard.addListener).mock.calls) if (event === "keyboardDidHide") listener({} as any); });
  expect(screen.getByRole("button", { name: "Send KOT" })).toBeTruthy();
});

it("opens Bill after a delayed order arrives and respects a later explicit New selection", () => {
  const { rerender } = render(<TicketScreen {...ticketProps} items={[]} sentItems={[]} currentOrder={null} />);
  rerender(<TicketScreen {...ticketProps} items={[]} />);
  expect(screen.getByRole("button", { name: "Print bill" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "New · 0" }));
  rerender(<TicketScreen {...ticketProps} items={[]} currentOrder={{ ...ticketProps.currentOrder }} />);
  expect(screen.queryByRole("button", { name: "Print bill" })).toBeNull();
});

it.each(["UPI amount", "Discount", "Tip"])("blocks malformed %s even when all other amounts match", (field) => {
  const settle = vi.fn();
  const currentOrder = { order: { id: "order", table_id: "M2" }, items: [], bill: { id: "bill", total_paise: 140000, paid_paise: 0 }, payments: [] } as unknown as HubOrder;
  render(<CaptainBillingPanel canBill currentOrder={currentOrder} hasNewItems={false} sending={false} onGenerateBill={vi.fn()} onReprintBill={vi.fn()} onMarkNc={vi.fn()} onReviseBill={vi.fn()} onSettleBill={settle} />);
  fireEvent.click(screen.getByRole("button", { name: "Cash" }));
  fireEvent.change(screen.getByLabelText(field), { target: { value: "1..2" } });
  expect((screen.getByRole("button", { name: "Record ₹1,400" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Enter valid amounts with up to two decimal places.")).toBeTruthy();
  expect(settle).not.toHaveBeenCalled();
});
