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
  billSummaries: [
    { billId: "today-old", billNumber: 1, orderId: "order-today-1", tableName: "T1", status: "paid", totalPaise: 10_000, discountPaise: 0, tipPaise: 0, finalTotalPaise: 10_000, paidPaise: 10_000, settledAt: null, payments: [] },
    { billId: "today-new", billNumber: 5, orderId: "order-today-5", tableName: "T5", status: "paid", totalPaise: 40_000, discountPaise: 0, tipPaise: 0, finalTotalPaise: 40_000, paidPaise: 40_000, settledAt: null, payments: [] }
  ]
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
    expect(viewModel.overview).toMatchObject({ salesPaise: 10_000, billCount: 2, collectedPaise: 10_000 });
    expect(viewModel.overview?.tenders.every((tender) => tender.amountPaise === null)).toBe(true);
  });

  it("shows newest bill first for today's history", () => {
    const viewModel = getBillingHistoryViewModel(currentSummary, null, null);

    expect(viewModel.bills.map((bill) => bill.billId)).toEqual(["today-new", "today-old"]);
    expect(viewModel.overview).toMatchObject({ salesPaise: 50_000, billCount: 5, collectedPaise: 50_000 });
    expect(viewModel.overview?.tenders.map((tender) => [tender.label, tender.amountPaise])).toEqual([["Cash", 20_000], ["UPI", 20_000], ["Card", 10_000], ["Online", 0]]);
  });

  it("does not show another day's detail or today's totals while a selected report is loading", () => {
    const selected = getBillingHistoryViewModel(currentSummary, "new-day", {
      pos_day_id: "previous-selection", business_date: "2026-05-15", status: "finalized", bill_count: 99,
      gross_sales_paise: 100, final_sales_paise: 100, total_payments_paise: 100, finalized_at: "", billSummaries: []
    });
    expect(selected.overview).toBeNull();
    expect(selected.bills).toEqual([]);
    expect(getBillingHistoryViewModel(null, null, null).overview).toBeNull();
  });

  it("groups historical split tenders from recorded payments and excludes NC records", () => {
    const bill = currentSummary.billSummaries[0]!;
    const viewModel = getBillingHistoryViewModel(currentSummary, "day-old", {
      pos_day_id: "day-old", business_date: "2026-05-16", status: "finalized", bill_count: 1,
      gross_sales_paise: 10_000, final_sales_paise: 10_000, total_payments_paise: 10_000, finalized_at: "",
      billSummaries: [
        { ...bill, payments: [{ method: "cash", amountPaise: 2000, reference: null }, { method: "cash", amountPaise: 3000, reference: null }, { method: "upi", amountPaise: 5000, reference: null }] },
        { ...bill, billId: "nc", isNc: true, payments: [{ method: "card", amountPaise: 10000, reference: null }] }
      ]
    });
    expect(viewModel.overview?.tenders.map((tender) => [tender.method, tender.amountPaise])).toEqual([["cash", 5000], ["upi", 5000], ["card", 0], ["online", 0]]);
  });

  it("does not turn a partial historical tender record into a complete split", () => {
    const viewModel = getBillingHistoryViewModel(currentSummary, "day-old", {
      pos_day_id: "day-old", business_date: "2026-05-16", status: "finalized", bill_count: 1,
      gross_sales_paise: 10_000, final_sales_paise: 10_000, total_payments_paise: 10_000, finalized_at: "",
      billSummaries: [{ ...currentSummary.billSummaries[0]!, payments: [{ method: "cash", amountPaise: 3000, reference: null }] }]
    });
    expect(viewModel.overview?.collectedPaise).toBe(10000);
    expect(viewModel.overview?.tenders.every((tender) => tender.amountPaise === null)).toBe(true);
  });
});
