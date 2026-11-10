import { groupPaymentsForDisplay } from "@gaurav-pos/shared";
import type { CurrentDaySummary, DailyReportDetail } from "./hub-client";

type HistoryBill = NonNullable<CurrentDaySummary["billSummaries"]>[number];
const TENDERS = [["cash", "Cash"], ["upi", "UPI"], ["card", "Card"], ["online", "Online"]] as const;

type HistoryOverview = {
  salesPaise: number;
  billCount: number;
  collectedPaise: number;
  tenders: Array<{ method: string; label: string; amountPaise: number | null }>;
};

function newestBillsFirst(bills: HistoryBill[]): HistoryBill[] {
  return [...bills].sort((left, right) => (right.billNumber ?? 0) - (left.billNumber ?? 0));
}

function savedDayTenders(report: DailyReportDetail): HistoryOverview["tenders"] {
  const payments = groupPaymentsForDisplay(report.billSummaries.filter((bill) => !bill.isNc).flatMap((bill) => bill.payments));
  // Older snapshots can contain a collected total without the original tender rows.
  const complete = payments.reduce((sum, payment) => sum + payment.amountPaise, 0) === report.total_payments_paise;
  const amounts = new Map(payments.map((payment) => [payment.method, payment.amountPaise]));
  return [
    ...TENDERS.map(([method, label]) => ({ method, label, amountPaise: complete ? amounts.get(method) ?? 0 : null })),
    ...payments.filter((payment) => !TENDERS.some(([method]) => method === payment.method))
  ];
}

export function getBillingHistoryViewModel(
  currentSummary: CurrentDaySummary | null,
  selectedHistoryDayId: string | null,
  selectedHistoryDetail: DailyReportDetail | null
): {
  label: string;
  bills: HistoryBill[];
  overview: HistoryOverview | null;
} {
  if (selectedHistoryDayId) {
    const report = selectedHistoryDetail?.pos_day_id === selectedHistoryDayId ? selectedHistoryDetail : null;
    return {
      label: report?.business_date ?? "Older day",
      bills: newestBillsFirst(report?.billSummaries ?? []),
      overview: report ? {
        salesPaise: report.final_sales_paise,
        billCount: report.bill_count,
        collectedPaise: report.total_payments_paise,
        tenders: savedDayTenders(report)
      } : null
    };
  }

  return {
    label: currentSummary?.businessDay.business_date ?? "Today",
    bills: newestBillsFirst(currentSummary?.billSummaries ?? []),
    overview: currentSummary ? {
      salesPaise: currentSummary.finalSalesPaise,
      billCount: currentSummary.billCount,
      collectedPaise: currentSummary.totalPaymentsPaise,
      tenders: [
        { method: "cash", label: "Cash", amountPaise: currentSummary.cashPaymentsPaise },
        { method: "upi", label: "UPI", amountPaise: currentSummary.upiPaymentsPaise },
        { method: "card", label: "Card", amountPaise: currentSummary.cardPaymentsPaise },
        { method: "online", label: "Online", amountPaise: currentSummary.onlinePaymentsPaise }
      ]
    } : null
  };
}
