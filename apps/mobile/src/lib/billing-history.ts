import type { CurrentDaySummary, DailyReportDetail } from "./hub-client";

type HistoryMetric = { label: string; value: string } | { label: string; valuePaise: number };
type HistoryBill = NonNullable<CurrentDaySummary["billSummaries"]>[number];

function newestBillsFirst(bills: HistoryBill[]): HistoryBill[] {
  return [...bills].sort((left, right) => (right.billNumber ?? 0) - (left.billNumber ?? 0));
}

export function getBillingHistoryViewModel(
  currentSummary: CurrentDaySummary | null,
  selectedHistoryDayId: string | null,
  selectedHistoryDetail: DailyReportDetail | null
): {
  label: string;
  bills: NonNullable<CurrentDaySummary["billSummaries"]>;
  metrics: HistoryMetric[];
} {
  if (selectedHistoryDayId) {
    return {
      label: selectedHistoryDetail?.business_date ?? "Older day",
      bills: newestBillsFirst(selectedHistoryDetail?.billSummaries ?? []),
      metrics: selectedHistoryDetail
        ? [
            { label: "Sales", valuePaise: selectedHistoryDetail.final_sales_paise },
            { label: "Bills", value: String(selectedHistoryDetail.bill_count) },
            { label: "Payments", valuePaise: selectedHistoryDetail.total_payments_paise },
            { label: "Gross", valuePaise: selectedHistoryDetail.gross_sales_paise }
          ]
        : []
    };
  }

  return {
    label: currentSummary?.businessDay.business_date ?? "Today",
    bills: newestBillsFirst(currentSummary?.billSummaries ?? []),
    metrics: currentSummary
      ? [
          { label: "Sales", valuePaise: currentSummary.finalSalesPaise },
          { label: "Bills", value: String(currentSummary.billCount) },
          { label: "Cash", valuePaise: currentSummary.cashPaymentsPaise },
          { label: "UPI/Card", valuePaise: currentSummary.upiPaymentsPaise + currentSummary.cardPaymentsPaise }
        ]
      : []
  };
}
