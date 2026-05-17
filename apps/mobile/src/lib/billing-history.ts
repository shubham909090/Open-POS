import type { CurrentDaySummary, DailyReportDetail } from "./hub-client";

type HistoryMetric = { label: string; value: string } | { label: string; valuePaise: number };

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
      bills: selectedHistoryDetail?.billSummaries ?? [],
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
    bills: currentSummary?.billSummaries ?? [],
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
