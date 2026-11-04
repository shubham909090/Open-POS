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
    fireEvent.click(screen.getByRole("button", { name: "Fill remaining into cash" }));
    fireEvent.keyDown(window, { key: "F8" });

    await waitFor(() => expect(settleBillMock).toHaveBeenCalledWith(
      "bill-1",
      expect.objectContaining({ payments: [expect.objectContaining({ method: "cash", amountPaise: 50000 })] }),
      expect.any(String)
    ));
    expect(screen.queryByText("Print paid bill where?")).toBeNull();
  });

  it("does not punch beneath reprint approval or its printer chooser", async () => {
    const { BillingPanel } = await importBillingPanel();
    let approve: ((value: { pin: string; reason: string; approvedBy: string }) => void) | undefined;
    requestManagerApprovalMock.mockImplementation(() => new Promise((resolve) => { approve = resolve; }));
    renderBillingPanel(BillingPanel);
    fireEvent.click(screen.getByRole("button", { name: "Fill remaining into cash" }));
    fireEvent.click(screen.getByRole("button", { name: "Reprint bill" }));
    fireEvent.keyDown(window, { key: "F8" });
    expect(settleBillMock).not.toHaveBeenCalled();
    approve?.({ pin: "1234", reason: "Reprint", approvedBy: "manager" });
    await screen.findByRole("dialog", { name: "Reprint bill where?" });
    fireEvent.keyDown(window, { key: "F8" });
    expect(settleBillMock).not.toHaveBeenCalled();
  });

  it("ignores F8 while an unrelated approval dialog covers the workspace", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);
    fireEvent.click(screen.getByRole("button", { name: "Fill remaining into cash" }));
    const approval = document.createElement("div");
    approval.setAttribute("role", "dialog");
    approval.dataset.state = "open";
    document.body.append(approval);
    fireEvent.keyDown(window, { key: "F8" });
    expect(settleBillMock).not.toHaveBeenCalled();
    approval.remove();
    fireEvent.keyDown(window, { key: "F8" });
    await waitFor(() => expect(settleBillMock).toHaveBeenCalled());
  });

  it("ignores F8 with modifier keys", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);

    fireEvent.click(screen.getByRole("button", { name: "Fill remaining into upi" }));
    fireEvent.keyDown(window, { key: "F8", shiftKey: true });

    expect(settleBillMock).not.toHaveBeenCalled();
  });

  it("does not punch or reprint the old bill while a revision is being edited", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);
    fireEvent.click(screen.getByRole("button", { name: "Fill remaining into cash" }));
    fireEvent.click(screen.getByRole("button", { name: "Revise printed bill" }));
    fireEvent.keyDown(window, { key: "F8" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(settleBillMock).not.toHaveBeenCalled();
    expect(requestManagerApprovalMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Punch bill/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fill remaining into cash" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Search dish to add"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: /Punch bill/ })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Revise printed bill" })));
  });

  it("renders one remaining-balance chip per payment method", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);

    const restButtons = screen.getAllByRole("button", { name: /Fill remaining into/ });
    expect(restButtons).toHaveLength(4);
  });

  it("method chip fills remaining balance for split payment", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Fill remaining into cash" }));

    expect(screen.queryByLabelText("Split payment breakdown")).toBeNull();
  });

  it("lets discount and bill name be entered before bill generation", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel, { bill: null });

    fireEvent.change(screen.getByLabelText("Name on bill"), { target: { value: "Sharma Family" } });
    fireEvent.change(screen.getByLabelText("Discount amount"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate bill" }));

    expect(generateBillMock).toHaveBeenCalledWith(expect.objectContaining({
      discountType: "amount",
      discountValue: 2500,
      tipPaise: 0,
      customerName: "Sharma Family"
    }));
  });

  it("keeps focus read-only and fills the remaining split only through its method chip", async () => {
    const { BillingPanel } = await importBillingPanel();
    const { container } = renderBillingPanel(BillingPanel);

    const paymentInputs = Array.from(container.querySelectorAll<HTMLInputElement>(".payment-grid input"));
    fireEvent.change(paymentInputs[0]!, { target: { value: "200" } });
    fireEvent.focus(paymentInputs[1]!);
    expect(paymentInputs[1]!.value).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Fill remaining into upi" }));
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

  it("calculates change against the cash portion of a split without changing its payment payload", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);
    fireEvent.change(screen.getByLabelText("Cash amount"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("UPI amount"), { target: { value: "400" } });
    fireEvent.change(screen.getByLabelText("Received amount"), { target: { value: "1000" } });
    expect(screen.getByText("Return ₹900.00")).toBeTruthy();
    fireEvent.keyDown(window, { key: "F8" });
    await waitFor(() => expect(settleBillMock).toHaveBeenCalledWith("bill-1", expect.objectContaining({ payments: [
      expect.objectContaining({ method: "cash", amountPaise: 10000 }),
      expect.objectContaining({ method: "upi", amountPaise: 40000 })
    ] }), expect.any(String)));
  });

  it("subtracts existing payments and new non-cash tenders before calculating cash change", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel, { bill: { id: "bill-1", order_id: "order-1", status: "pending", total_paise: 50000, final_total_paise: 50000, discount_paise: 0, tip_paise: 0, paid_paise: 20000 } });
    fireEvent.change(screen.getByLabelText("Cash amount"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Card amount"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Received amount"), { target: { value: "500" } });
    expect(screen.getByText("Return ₹300.00")).toBeTruthy();
  });

  it("returns all cash received when non-cash covers the bill and still rejects overpayment", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);
    fireEvent.change(screen.getByLabelText("UPI amount"), { target: { value: "500" } });
    expect(screen.getByText("Return ₹0.00")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Received amount"), { target: { value: "100" } });
    expect(screen.getByText("Return ₹100.00")).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Cash amount").value).toBe("0");
    fireEvent.change(screen.getByLabelText("Cash amount"), { target: { value: "100" } });
    expect(screen.getByText("Payment is ₹100.00 more than the balance.")).toBeTruthy();
    fireEvent.keyDown(window, { key: "F8" });
    expect(settleBillMock).not.toHaveBeenCalled();
  });

  it("keeps empty change input at zero and hides invalid or non-finite calculations", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);
    expect(screen.getByText("Return ₹0.00")).toBeTruthy();
    const received = screen.getByLabelText("Received amount");
    for (const value of ["invalid", "Infinity", "-10"]) {
      fireEvent.change(received, { target: { value } });
      expect(screen.getByText("Return —")).toBeTruthy();
      expect(received.getAttribute("aria-invalid")).toBe("true");
    }
    fireEvent.change(received, { target: { value: "1000" } });
    for (const label of ["Cash amount", "UPI amount"]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: "Infinity" } });
      expect(screen.getByText("Return —")).toBeTruthy();
      fireEvent.change(screen.getByLabelText(label), { target: { value: "0" } });
    }
    expect(screen.getByText("Return ₹500.00")).toBeTruthy();
  });

  it("opens on Cash and ignores bare Enter until Reprint itself is activated", async () => {
    const { BillingPanel } = await importBillingPanel();
    requestManagerApprovalMock.mockResolvedValue({ pin: "1234", reason: "Bill reprint", approvedBy: "manager" });
    renderBillingPanel(BillingPanel);
    expect(document.activeElement).toBe(screen.getByLabelText("Cash amount"));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(requestManagerApprovalMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reprint bill" }));
    await waitFor(() => expect(requestManagerApprovalMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Approve bill reprint" })));
  });

  it("does not use Enter for reprint when the bill button is hidden or a form control has focus", async () => {
    const { BillingPanel } = await importBillingPanel();
    requestManagerApprovalMock.mockResolvedValue({ pin: "1234", reason: "Bill reprint", approvedBy: "manager" });

    renderBillingPanel(BillingPanel, { bill: null });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(requestManagerApprovalMock).not.toHaveBeenCalled();

    cleanup();
    renderBillingPanel(BillingPanel);
    const noteInput = screen.getByPlaceholderText("UPI ref, card slip");
    fireEvent.keyDown(noteInput, { key: "Enter" });

    expect(requestManagerApprovalMock).not.toHaveBeenCalled();
  });
  it("never labels excess or invalid tenders as paid", async () => {
    const { BillingPanel } = await importBillingPanel();
    renderBillingPanel(BillingPanel);
    fireEvent.change(screen.getByLabelText("Cash amount"), { target: { value: "600" } });
    expect(screen.queryByText("Fully covered")).toBeNull();
    expect((screen.getByRole("button", { name: /Punch bill.*over/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Cash amount"), { target: { value: "invalid" } });
    expect(screen.getByText("Enter valid amounts")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Punch bill.*check amounts/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("₹NaN")).toBeNull();
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
