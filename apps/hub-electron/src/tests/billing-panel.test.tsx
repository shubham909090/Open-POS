// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableOrder } from "../renderer/hub-api.js";

const settleBillMock = vi.fn();

describe("hub billing shortcuts", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
    settleBillMock.mockReset();
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
});

async function importBillingPanel() {
  vi.doMock("../renderer/hub-api.js", () => ({
    hubApi: {
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
        generateBill={vi.fn()}
        generating={false}
        onSettled={vi.fn().mockResolvedValue(undefined)}
        setNotice={vi.fn()}
        requestManagerApproval={vi.fn()}
      />
    </QueryClientProvider>
  );
}
