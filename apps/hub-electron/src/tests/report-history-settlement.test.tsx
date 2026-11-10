// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ReportHistoryTable, type HistoryBill } from "../renderer/components/reports/report-history-table.js";

afterEach(cleanup);

const paidBill: HistoryBill = {
  billId: "paid", billNumber: 1, orderId: "order-paid", tableName: "T1", status: "paid",
  totalPaise: 50_000, finalTotalPaise: 50_000, paidPaise: 50_000,
  discountPaise: 0, tipPaise: 0, settledAt: "2026-11-10T10:00:00.000Z",
  payments: [{ method: "cash", amountPaise: 50_000, reference: null }],
};

function show(bills: HistoryBill[]) {
  const onPrint = vi.fn(), onEdit = vi.fn();
  render(<ReportHistoryTable bills={bills} billLimit={8} hasBillSummaries reprintPending={false} onLoadMore={vi.fn()} onPrint={onPrint} onEdit={onEdit} />);
  return { onPrint, onEdit };
}

it("shows settlement immediately and preserves print and edit actions", () => {
  const { onPrint, onEdit } = show([paidBill]);
  expect(screen.getByRole("columnheader", { name: "Settlement" })).toBeTruthy();
  const cash = screen.getByText("Cash");
  expect(cash.closest("details")).toBeNull();
  expect(screen.getByLabelText("Settlement for bill 1").textContent).toContain("₹500.00 paid");
  expect(screen.queryByText("Discount")).toBeNull();
  expect(screen.queryByText("Tip")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Print" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(onPrint).toHaveBeenCalledWith("paid");
  expect(onEdit).toHaveBeenCalledWith(paidBill);
});

it("shows grouped split amounts outside the collapsed breakup", () => {
  show([{ ...paidBill, payments: [
    { method: "upi", amountPaise: 30_000, reference: null },
    { method: "cash", amountPaise: 10_000, reference: null },
    { method: "cash", amountPaise: 10_000, reference: null },
  ] }]);
  const settlement = screen.getByLabelText("Settlement for bill 1");
  expect(within(settlement).getAllByText("Cash")).toHaveLength(1);
  expect(within(settlement).getByText("₹200.00")).toBeTruthy();
  expect(within(settlement).getByText("UPI")).toBeTruthy();
  expect(within(settlement).getByText("₹300.00")).toBeTruthy();
  expect(settlement.closest("details")).toBeNull();
});

it("keeps subtotal, tax and applied adjustments visible without opening a breakup", () => {
  show([{ ...paidBill, subtotalPaise: 9_000, taxPaise: 1_000, totalPaise: 10_000, discountPaise: 1_000, tipPaise: 500, finalTotalPaise: 9_500, paidPaise: 9_500, payments: [{ method: "cash", amountPaise: 9_500, reference: null }] }]);
  const subtotal = screen.getByText("Subtotal");
  expect(subtotal.closest("details")).toBeNull();
  const total = subtotal.closest<HTMLElement>(".history-bill-total")!;
  for (const label of ["Subtotal", "Tax", "Discount", "Tip"]) expect(within(total).getByText(label)).toBeTruthy();
  expect(total.textContent).toContain("₹95.00");
  expect(total.textContent).toContain("Subtotal₹90.00");
  expect(total.textContent).toContain("Tax₹10.00");
  expect(total.textContent).toContain("Discount₹10.00");
  expect(total.textContent).toContain("Tip₹5.00");
  expect(screen.queryByText("Breakup")).toBeNull();
});

it("shows a partial payment balance without treating pending bills as settled", () => {
  show([{ ...paidBill, status: "pending", paidPaise: 10_000, settledAt: null, payments: [{ method: "cash", amountPaise: 10_000, reference: null }] }]);
  expect(screen.getByLabelText("Settlement for bill 1").textContent).toContain("₹100.00 paid");
  expect(screen.getByText("₹400.00 due")).toBeTruthy();
  expect(screen.getByText("Not settled")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});

it("does not invent tenders for legacy paid bills with no split records", () => {
  show([{ ...paidBill, payments: [] }]);
  expect(screen.getByLabelText("Settlement for bill 1").textContent).toContain("₹500.00 paid");
  expect(screen.queryByText("Cash")).toBeNull();
});

it("clearly distinguishes NC, voided and zero-value bills", () => {
  show([
    { ...paidBill, billId: "nc", billNumber: 2, isNc: true, paidPaise: 0, payments: [], settledAt: null },
    { ...paidBill, billId: "void", billNumber: 3, status: "void", paidPaise: 0, settledAt: null },
    { ...paidBill, billId: "zero", billNumber: 4, finalTotalPaise: 0, paidPaise: 0, payments: [] },
  ]);
  expect(screen.getByText("No charge")).toBeTruthy();
  expect(screen.getByText("Voided")).toBeTruthy();
  expect(screen.getByText("No payment due")).toBeTruthy();
  expect(screen.queryByText(/₹.* due/)).toBeNull();
  expect(screen.queryByText("Cash")).toBeNull();
});
