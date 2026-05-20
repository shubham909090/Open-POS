import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export const dailyReportListValidator = v.array(
  v.object({
    _id: v.id("dailyReports"),
    businessDate: v.string(),
    status: v.literal("finalized"),
    billCount: v.number(),
    grossSalesPaise: v.number(),
    discountPaise: v.number(),
    tipPaise: v.number(),
    finalSalesPaise: v.number(),
    totalPaymentsPaise: v.number(),
    finalizedAt: v.string(),
    updatedAt: v.string()
  })
);

export const dailyReportDetailValidator = v.union(
  v.null(),
  v.object({
    report: v.object({
      businessDate: v.string(),
      status: v.literal("finalized"),
      grossSalesPaise: v.number(),
      discountPaise: v.number(),
      tipPaise: v.number(),
      finalSalesPaise: v.number(),
      cashPaymentsPaise: v.number(),
      upiPaymentsPaise: v.number(),
      cardPaymentsPaise: v.number(),
      onlinePaymentsPaise: v.number(),
      totalPaymentsPaise: v.number(),
      nonCashPaymentsPaise: v.number(),
      billCount: v.number(),
      openOrders: v.number(),
      billedOrders: v.number(),
      paidBills: v.number(),
      unpaidBills: v.number(),
      cancelledOrders: v.number(),
      finalizedAt: v.string(),
      updatedAt: v.string()
    }),
    bills: v.array(
      v.object({
        billId: v.string(),
        orderId: v.string(),
        tableName: v.string(),
        status: v.string(),
        totalPaise: v.number(),
        discountPaise: v.number(),
        tipPaise: v.number(),
        finalTotalPaise: v.number(),
        paidPaise: v.number(),
        isNc: v.optional(v.boolean()),
        ncReason: v.optional(v.string()),
        revisionNumber: v.optional(v.number()),
        paymentsJson: v.string(),
        settledAt: v.optional(v.string())
      })
    ),
    items: v.array(
      v.object({
        menuItemId: v.string(),
        name: v.string(),
        saleGroupId: v.optional(v.string()),
        saleGroupName: v.optional(v.string()),
        saleGroupKind: v.optional(v.string()),
        quantity: v.number(),
        grossSalesPaise: v.number(),
        ncQuantity: v.optional(v.number()),
        ncGrossSalesPaise: v.optional(v.number())
      })
    ),
    groups: v.array(
      v.object({
        saleGroupId: v.string(),
        name: v.string(),
        kind: v.string(),
        quantity: v.number(),
        grossSalesPaise: v.number(),
        taxPaise: v.number(),
        finalSalesPaise: v.number(),
        ncQuantity: v.number(),
        ncGrossSalesPaise: v.number()
      })
    )
  })
);

export function toDailyReportListItem(row: Doc<"dailyReports">) {
  return {
    _id: row._id,
    businessDate: row.businessDate,
    status: row.status,
    billCount: row.billCount,
    grossSalesPaise: row.grossSalesPaise,
    discountPaise: row.discountPaise,
    tipPaise: row.tipPaise,
    finalSalesPaise: row.finalSalesPaise,
    totalPaymentsPaise: row.totalPaymentsPaise,
    finalizedAt: row.finalizedAt,
    updatedAt: row.updatedAt
  };
}

export function toDailyReportDetail(
  report: Doc<"dailyReports">,
  bills: Doc<"dailyReportBills">[],
  items: Doc<"dailyReportItems">[],
  groups: Doc<"dailyReportGroups">[]
) {
  return {
    report: {
      businessDate: report.businessDate,
      status: report.status,
      grossSalesPaise: report.grossSalesPaise,
      discountPaise: report.discountPaise,
      tipPaise: report.tipPaise,
      finalSalesPaise: report.finalSalesPaise,
      cashPaymentsPaise: report.cashPaymentsPaise,
      upiPaymentsPaise: report.upiPaymentsPaise,
      cardPaymentsPaise: report.cardPaymentsPaise,
      onlinePaymentsPaise: report.onlinePaymentsPaise,
      totalPaymentsPaise: report.totalPaymentsPaise,
      nonCashPaymentsPaise: report.nonCashPaymentsPaise,
      billCount: report.billCount,
      openOrders: report.openOrders,
      billedOrders: report.billedOrders,
      paidBills: report.paidBills,
      unpaidBills: report.unpaidBills,
      cancelledOrders: report.cancelledOrders,
      finalizedAt: report.finalizedAt,
      updatedAt: report.updatedAt
    },
    bills: bills.map((bill) => ({
      billId: bill.billId,
      orderId: bill.orderId,
      tableName: bill.tableName,
      status: bill.status,
      totalPaise: bill.totalPaise,
      discountPaise: bill.discountPaise,
      tipPaise: bill.tipPaise,
      finalTotalPaise: bill.finalTotalPaise,
      paidPaise: bill.paidPaise,
      isNc: bill.isNc,
      ...(bill.ncReason ? { ncReason: bill.ncReason } : {}),
      revisionNumber: bill.revisionNumber,
      paymentsJson: bill.paymentsJson,
      ...(bill.settledAt ? { settledAt: bill.settledAt } : {})
    })),
    items: items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      saleGroupId: item.saleGroupId,
      saleGroupName: item.saleGroupName,
      saleGroupKind: item.saleGroupKind,
      quantity: item.quantity,
      grossSalesPaise: item.grossSalesPaise,
      ncQuantity: item.ncQuantity,
      ncGrossSalesPaise: item.ncGrossSalesPaise
    })),
    groups: groups.map((group) => ({
      saleGroupId: group.saleGroupId,
      name: group.name,
      kind: group.kind,
      quantity: group.quantity,
      grossSalesPaise: group.grossSalesPaise,
      taxPaise: group.taxPaise,
      finalSalesPaise: group.finalSalesPaise,
      ncQuantity: group.ncQuantity,
      ncGrossSalesPaise: group.ncGrossSalesPaise
    }))
  };
}
