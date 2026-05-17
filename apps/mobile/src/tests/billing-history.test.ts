import { describe, expect, it } from "vitest";
import { getBillingHistoryViewModel } from "../lib/billing-history";

const currentSummary = {
  businessDay: { business_date: "2026-05-17", period_start_at: "", period_end_at: "" },
  billCount: 5,
  openOrders: 0,
  billedOrders: 1,
  paidBills: 4,
  unpaidBills: 1,
  grossSalesPaise: 50_000,
  discountPaise: 0,
  tipPaise: 0,
  finalSalesPaise: 50_000,
  cashPaymentsPaise: 20_000,
  upiPaymentsPaise: 20_000,
  cardPaymentsPaise: 10_000,
  onlinePaymentsPaise: 0,
  totalPaymentsPaise: 50_000,
  billSummaries: [{ billId: "today-bill", orderId: "order-today", tableName: "T1", status: "paid", totalPaise: 50_000, discountPaise: 0, tipPaise: 0, finalTotalPaise: 50_000, paidPaise: 50_000, settledAt: null, payments: [] }]
};

describe("mobile billing history view model", () => {
  it("uses older selected report totals and bills instead of today's summary", () => {
    const viewModel = getBillingHistoryViewModel(currentSummary, "day-old", {
      pos_day_id: "day-old",
      business_date: "2026-05-16",
      status: "finalized",
      bill_count: 2,
      gross_sales_paise: 12_000,
      final_sales_paise: 10_000,
      total_payments_paise: 10_000,
      finalized_at: "",
      billSummaries: [{ billId: "old-bill", orderId: "order-old", tableName: "T2", status: "paid", totalPaise: 12_000, discountPaise: 2_000, tipPaise: 0, finalTotalPaise: 10_000, paidPaise: 10_000, settledAt: null, payments: [] }]
    });

    expect(viewModel.label).toBe("2026-05-16");
    expect(viewModel.bills.map((bill) => bill.billId)).toEqual(["old-bill"]);
    expect(viewModel.metrics).toEqual([
      { label: "Sales", valuePaise: 10_000 },
      { label: "Bills", value: "2" },
      { label: "Payments", valuePaise: 10_000 },
      { label: "Gross", valuePaise: 12_000 }
    ]);
  });
});
