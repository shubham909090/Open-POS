// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const historyEditBillMock = vi.fn();
const billPrintersMock = vi.fn();
const rangeReportMock = vi.fn();

describe("reports history payment edit", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
    historyEditBillMock.mockReset();
    billPrintersMock.mockReset();
    rangeReportMock.mockReset();
  });

  it("requires exact edited payment split and sends shared reference with history edit", async () => {
    const { ReportsView } = await importReportsView();
    historyEditBillMock.mockResolvedValue({ billId: "bill-1", revisionNumber: 2, totalPaise: 50_000, printJobId: "print-1", modified: true });
    renderReportsView(ReportsView);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Master PIN"), { target: { value: "9876" } });

    const saveButton = screen.getByRole("button", { name: "Save + Print" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("History Cash amount"), { target: { value: "200" } });
    expect(screen.getByText("₹300.00 remaining")).toBeTruthy();
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.focus(screen.getByLabelText("History UPI amount"));
    expect(screen.getByLabelText<HTMLInputElement>("History UPI amount").value).toBe("300");
    expect(screen.getByText("Payment exact")).toBeTruthy();
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("UPI ref, card slip, or owner note"), { target: { value: "UPI-7788" } });
    fireEvent.click(saveButton);
    fireEvent.click(await screen.findByRole("button", { name: /Default printer/ }));

    await waitFor(() => expect(historyEditBillMock).toHaveBeenCalled());
    expect(historyEditBillMock).toHaveBeenCalledWith(
      "bill-1",
      expect.objectContaining({
        masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" },
        payments: [
          { method: "cash", amountPaise: 20_000, reference: "UPI-7788" },
          { method: "upi", amountPaise: 30_000, reference: "UPI-7788" }
        ]
      }),
      expect.any(String),
      "default"
    );
  });

  it("switches to monthly range reports, shows missing dates, and lazily loads bill history", async () => {
    const { ReportsView } = await importReportsView();
    rangeReportMock.mockResolvedValue(rangeSummary(false));
    renderReportsView(ReportsView);

    fireEvent.click(await screen.findByRole("tab", { name: "Monthly / Range" }));

    expect(await screen.findByText("Finalized business days only")).toBeTruthy();
    expect(await screen.findByText("Some selected dates have no finalized report.")).toBeTruthy();
    expect(screen.getByText("Missing: 2026-05-02")).toBeTruthy();
    expect(screen.getByText("Daily breakdown")).toBeTruthy();
    expect(screen.getByText("Bill history is collapsed for performance.")).toBeTruthy();

    rangeReportMock.mockResolvedValue(rangeSummary(true));
    fireEvent.click(screen.getByRole("button", { name: "Load bill history" }));

    await waitFor(() => expect(rangeReportMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), true));
  });
});

async function importReportsView() {
  billPrintersMock.mockResolvedValue({
    default: { label: "Main bill printer", printerMode: "system", printerName: "EPSON", printerPort: 9100, configured: true },
    alternate: { label: "Second bill printer", printerMode: "system", printerPort: 9100, configured: false }
  });
  vi.doMock("../renderer/hub-api.js", () => ({
    hubApi: {
      currentBusinessDaySummary: vi.fn().mockResolvedValue(summary()),
	      dailyReports: vi.fn().mockResolvedValue([]),
	      dailyReport: vi.fn(),
	      rangeReport: rangeReportMock,
	      alcoholStockMovements: vi.fn().mockResolvedValue([]),
      bootstrap: vi.fn().mockResolvedValue({ menuItems: [] }),
      historyEditBill: historyEditBillMock,
      historyReprintBill: vi.fn(),
      billPrinters: billPrintersMock
    }
  }));
  return import("../renderer/components/reports/reports-view.js");
}

function rangeSummary(includeBills: boolean) {
  return {
    range: { from: "2026-05-01", to: "2026-05-03" },
    availableDays: [
      {
        pos_day_id: "day-1",
        business_date: "2026-05-01",
        status: "finalized",
        bill_count: 1,
        gross_sales_paise: 50_000,
        discount_paise: 0,
        tip_paise: 0,
        final_sales_paise: 50_000,
        cash_payments_paise: 50_000,
        upi_payments_paise: 0,
        card_payments_paise: 0,
        online_payments_paise: 0,
        total_payments_paise: 50_000,
        finalized_at: "2026-05-01T19:00:00.000Z"
      }
    ],
    missingDates: ["2026-05-02"],
    unfinalizedDates: [],
    openOrders: 0,
    billedOrders: 0,
    paidBills: 1,
    unpaidBills: 0,
    cancelledOrders: 0,
    billCount: 1,
    grossSalesPaise: 50_000,
    discountPaise: 0,
    tipPaise: 0,
    finalSalesPaise: 50_000,
    cashPaymentsPaise: 50_000,
    upiPaymentsPaise: 0,
    cardPaymentsPaise: 0,
    onlinePaymentsPaise: 0,
    totalPaymentsPaise: 50_000,
    nonCashPaymentsPaise: 0,
    itemSummaries: [],
    groupSummaries: [],
    ...(includeBills ? { billSummaries: summary().billSummaries } : {})
  };
}

function renderReportsView(ReportsView: typeof import("../renderer/components/reports/reports-view.js").ReportsView) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportsView />
    </QueryClientProvider>
  );
}

function summary() {
  return {
    businessDay: { id: "day-1", business_date: "2026-05-20", period_start_at: "", period_end_at: "", status: "active" },
    billCount: 1,
    orderCount: 1,
    cancelledOrders: 0,
    grossSalesPaise: 50_000,
    taxPaise: 0,
    discountPaise: 0,
    tipPaise: 0,
    finalSalesPaise: 50_000,
    cashPaymentsPaise: 50_000,
    upiPaymentsPaise: 0,
    cardPaymentsPaise: 0,
    onlinePaymentsPaise: 0,
    totalPaymentsPaise: 50_000,
    nonCashPaymentsPaise: 0,
    billSummaries: [
      {
        billId: "bill-1",
        billNumber: 7,
        orderId: "order-1",
        tableName: "T1",
        status: "paid",
        subtotalPaise: 50_000,
        taxPaise: 0,
        totalPaise: 50_000,
        discountPaise: 0,
        tipPaise: 0,
        finalTotalPaise: 50_000,
        paidPaise: 50_000,
        settledAt: "2026-05-20T10:00:00.000Z",
        payments: [{ method: "cash", amountPaise: 50_000, reference: null }],
        items: [
          {
            orderItemId: "order-item-1",
            menuItemId: "item-1",
            menuItemVariantId: null,
            saleGroupId: "sg-food",
            productionUnitId: "unit-kitchen",
            name: "Dal Fry",
            quantity: 1,
            unitPricePaise: 50_000,
            lineTotalPaise: 50_000
          }
        ],
        isNc: false,
        revisionNumber: 1,
        modified: false
      }
    ],
    itemSummaries: [],
    groupSummaries: []
  };
}
