// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableOrder } from "../renderer/hub-api.js";

const settleBillMock = vi.fn();
const billPrintersMock = vi.fn();
const generateBillMock = vi.fn();
const requestManagerApprovalMock = vi.fn();

describe("hub billing shortcuts", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
    settleBillMock.mockReset();
    billPrintersMock.mockReset();
    generateBillMock.mockReset();
    requestManagerApprovalMock.mockReset();
  });

  it("uses F8 to punch the visible bill only when payment is complete", async () => {
    const { BillingPanel } = await importBillingPanel();
    settleBillMock.mockResolvedValue({ billId: "bill-1", status: "paid", remainingPaise: 0 });

    renderBillingPanel(BillingPanel, { payments: [{ id: "pay-1", bill_id: "bill-1", method: "cash", amount_paise: 50000, reference: null, created_at: "" }] });
    fireEvent.keyDown(window, { key: "F8" });
    expect(settleBillMock).not.toHaveBeenCalled();

    cleanup();
    renderBillingPanel(BillingPanel);
    fireEvent.click(screen.getByRole("button", { name: "Full cash" }));
    fireEvent.keyDown(window, { key: "F8" });

    await waitFor(() => expect(settleBillMock).toHaveBeenCalledWith(
      "bill-1",
      expect.objectContaining({ payments: [expect.objectContaining({ method: "cash", amountPaise: 50000 })] }),
      expect.any(String)
    ));
    expect(screen.queryByText("Print paid bill where?")).toBeNull();
  });

  it("ignores F8 with modifier keys", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);

    fireEvent.click(screen.getByRole("button", { name: "Full UPI" }));
    fireEvent.keyDown(window, { key: "F8", shiftKey: true });

    expect(settleBillMock).not.toHaveBeenCalled();
  });

  it("renders Rest buttons for each payment method", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);

    const restButtons = screen.getAllByRole("button", { name: /Fill remaining into/ });
    expect(restButtons).toHaveLength(4);
  });

  it("Rest button fills remaining balance for split payment", async () => {
    const { BillingPanel } = await importBillingPanel();
    const { container } = renderBillingPanel(BillingPanel);

    // Set cash to 200 (bill total is 500)
    const paymentInputs = Array.from(container.querySelectorAll<HTMLInputElement>(".payment-grid input"));
    expect(paymentInputs.length).toBeGreaterThanOrEqual(4);
    fireEvent.change(paymentInputs[0]!, { target: { value: "200" } });

    // Click Rest on UPI (second Rest button)
    const restButtons = screen.getAllByRole("button", { name: /Fill remaining into/ });
    fireEvent.click(restButtons[1]!);

    // UPI should be 300 (500 - 200 = 300)
    const updatedInputs = Array.from(container.querySelectorAll<HTMLInputElement>(".payment-grid input"));
    expect(updatedInputs[1]!.value).toBe("300");
  });

  it("shows split summary when multiple methods have amounts", async () => {
    const { BillingPanel } = await importBillingPanel();
    const { container } = renderBillingPanel(BillingPanel);

    // Set cash to 200 and UPI to 300
    const paymentInputs = Array.from(container.querySelectorAll<HTMLInputElement>(".payment-grid input"));
    fireEvent.change(paymentInputs[0]!, { target: { value: "200" } });
    fireEvent.change(paymentInputs[1]!, { target: { value: "300" } });

    // Split summary should appear
    expect(screen.queryByLabelText("Split payment breakdown")).toBeTruthy();
  });

  it("hides split summary for single-method payment", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);

    fireEvent.click(screen.getByRole("button", { name: "Full cash" }));

    expect(screen.queryByLabelText("Split payment breakdown")).toBeNull();
  });

  it("lets discount be entered before bill generation and sends it with generate bill", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel, { bill: null });

    fireEvent.change(screen.getByLabelText("Discount amount"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate bill" }));

    expect(generateBillMock).toHaveBeenCalledWith(expect.objectContaining({
      discountType: "amount",
      discountValue: 2500,
      tipPaise: 0
    }));
  });

  it("auto-fills remaining split amount on focus without locking the field", async () => {
    const { BillingPanel } = await importBillingPanel();
    const { container } = renderBillingPanel(BillingPanel);

    const paymentInputs = Array.from(container.querySelectorAll<HTMLInputElement>(".payment-grid input"));
    fireEvent.change(paymentInputs[0]!, { target: { value: "200" } });
    fireEvent.focus(paymentInputs[1]!);
    expect(paymentInputs[1]!.value).toBe("300");

    fireEvent.change(paymentInputs[1]!, { target: { value: "250" } });
    expect(paymentInputs[1]!.value).toBe("250");
  });

  it("shows a local return calculator without changing payment amounts", async () => {
    const { BillingPanel } = await importBillingPanel();
    const { container } = renderBillingPanel(BillingPanel);

    fireEvent.change(screen.getByLabelText("Received amount"), { target: { value: "1000" } });

    expect(screen.getByText("Return ₹500.00")).toBeTruthy();
    const paymentInputs = Array.from(container.querySelectorAll<HTMLInputElement>(".payment-grid input"));
    expect(paymentInputs.every((input) => input.value === "0")).toBe(true);
  });

  it("uses Enter to request reprint only while the bill reprint button is visible", async () => {
    const { BillingPanel } = await importBillingPanel();
    requestManagerApprovalMock.mockResolvedValue({ pin: "1234", reason: "Bill reprint", approvedBy: "manager" });

    renderBillingPanel(BillingPanel);

    expect(screen.getByRole("button", { name: /Reprint bill/i })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => expect(requestManagerApprovalMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Approve bill reprint",
      defaultReason: "Bill reprint"
    })));
  });

  it("does not use Enter for reprint when the bill button is hidden or a form control has focus", async () => {
    const { BillingPanel } = await importBillingPanel();
    requestManagerApprovalMock.mockResolvedValue({ pin: "1234", reason: "Bill reprint", approvedBy: "manager" });

    renderBillingPanel(BillingPanel, { bill: null });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(requestManagerApprovalMock).not.toHaveBeenCalled();

    cleanup();
    renderBillingPanel(BillingPanel);
    const noteInput = screen.getByPlaceholderText("UPI ref, card slip, or captain note");
    fireEvent.keyDown(noteInput, { key: "Enter" });

    expect(requestManagerApprovalMock).not.toHaveBeenCalled();
  });
});

async function importBillingPanel() {
  billPrintersMock.mockResolvedValue({
    default: { label: "Main bill printer", printerMode: "system", printerName: "EPSON", printerPort: 9100, configured: true },
    alternate: { label: "Second bill printer", printerMode: "system", printerPort: 9100, configured: false }
  });
  vi.doMock("../renderer/hub-api.js", () => ({
    hubApi: {
      billPrinters: billPrintersMock,
      settleBill: settleBillMock,
      printBill: vi.fn(),
      reprintBill: vi.fn(),
      markBillNc: vi.fn(),
      reviseBill: vi.fn()
    }
  }));
  return import("../renderer/components/orders/billing-panel.js");
}

function renderBillingPanel(
  BillingPanel: typeof import("../renderer/components/orders/billing-panel.js").BillingPanel,
  overrides: Partial<TableOrder> = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tableOrder: TableOrder = {
    order: { id: "order-1", table_id: "table-t1", status: "billed", pax: 2, captain_id: "hub" },
    items: [],
    bill: {
      id: "bill-1",
      order_id: "order-1",
      status: "pending",
      total_paise: 50000,
      discount_paise: 0,
      tip_paise: 0,
      final_total_paise: 50000,
      paid_paise: 0
    },
    payments: [],
    ...overrides
  };

  return render(
    <QueryClientProvider client={client}>
      <BillingPanel
        tableOrder={tableOrder}
        menuItems={[]}
        sentTotal={50000}
        generateBill={generateBillMock}
        generating={false}
        onSettled={vi.fn().mockResolvedValue(undefined)}
        setNotice={vi.fn()}
        requestManagerApproval={requestManagerApprovalMock}
      />
    </QueryClientProvider>
  );
}
