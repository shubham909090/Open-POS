import type { PrintLayoutSettingsInput, TaxComponentAmount } from "@gaurav-pos/shared";
import { calculateLineTotal, calculateTaxComponents } from "@gaurav-pos/shared";

import type { SqliteDatabase } from "../../db/database.js";
import type { BillTicket } from "../tickets.js";
import { parseTaxComponents } from "./tax.js";
import type { BillRow, OrderItemRow } from "./types.js";

export function buildBillTicket(input: {
  db: SqliteDatabase;
  bill: Pick<
    BillRow,
    | "id"
    | "bill_number"
    | "order_id"
    | "subtotal_paise"
    | "tax_paise"
    | "total_paise"
    | "discount_paise"
    | "tip_paise"
    | "final_total_paise"
    | "revision_number"
    | "nc_reason"
  >;
  tableName: string;
  createdAt: string;
  orderItems: OrderItemRow[];
  receiptLayout: PrintLayoutSettingsInput;
  discountPaise?: number;
  tipPaise?: number;
  finalTotalPaise?: number;
  ncReason?: string | null;
}): BillTicket {
  const billableItems = input.orderItems.filter((item) => item.quantity > 0 && item.status !== "cancelled");
  const billPayments = input.db
    .prepare("SELECT method, amount_paise FROM payments WHERE bill_id = ? ORDER BY created_at, id")
    .all(input.bill.id) as Array<{ method: string; amount_paise: number }>;
  const taxBreakdown = compactPrintableTaxBreakdown(billableItems);
  return {
    tableName: input.tableName,
    billId: String(input.bill.bill_number || input.bill.id),
    items: billableItems.map((item) => ({
      name: item.name_snapshot,
      variantName: item.variant_name_snapshot || null,
      quantity: item.quantity,
      unitPricePaise: item.unit_price_paise,
      lineTotalPaise: calculateLineTotal(item.unit_price_paise, item.quantity)
    })),
    subtotalPaise: input.bill.subtotal_paise,
    taxPaise: taxBreakdown.length ? input.bill.tax_paise : 0,
    totalPaise: input.bill.total_paise,
    discountPaise: input.discountPaise ?? input.bill.discount_paise,
    tipPaise: input.tipPaise ?? input.bill.tip_paise,
    finalTotalPaise: input.finalTotalPaise ?? input.bill.final_total_paise,
    createdAt: input.createdAt,
    taxBreakdown,
    payments: billPayments.map((payment) => ({ method: payment.method, amountPaise: payment.amount_paise })),
    revisionNumber: input.bill.revision_number,
    ncReason: input.ncReason ?? input.bill.nc_reason,
    ...billPrintLayout(input.receiptLayout)
  };
}

function compactPrintableTaxBreakdown(items: OrderItemRow[]): TaxComponentAmount[] {
  const taxByComponent = new Map<string, TaxComponentAmount>();
  for (const item of items) {
    if (item.sale_group_kind_snapshot === "alcohol") continue;
    const lineSubtotal = calculateLineTotal(item.unit_price_paise, item.quantity);
    const components = calculateTaxComponents(lineSubtotal, parseTaxComponents(item.tax_components_json));
    for (const component of components) {
      const key = `${component.name}:${component.rateBps}`;
      const current = taxByComponent.get(key) ?? { name: component.name, rateBps: component.rateBps, amountPaise: 0 };
      current.amountPaise += component.amountPaise;
      taxByComponent.set(key, current);
    }
  }
  return [...taxByComponent.values()];
}

function billPrintLayout(layout: PrintLayoutSettingsInput): Pick<
  BillTicket,
  | "restaurantName"
  | "restaurantAddress"
  | "taxRegistrationText"
  | "lineWidthChars"
  | "headerAlign"
  | "footerAlign"
  | "sectionStyles"
  | "topPaddingLines"
  | "feedLines"
  | "showTable"
  | "showDateTime"
  | "showBillId"
  | "showTaxBreakup"
  | "showPaymentSplit"
  | "showDiscountTip"
  | "showNcReprintRevision"
  | "header"
  | "footer"
> {
  return {
    restaurantName: layout.restaurantName,
    restaurantAddress: layout.restaurantAddress,
    taxRegistrationText: layout.taxRegistrationText,
    lineWidthChars: layout.lineWidthChars,
    headerAlign: layout.headerAlign,
    footerAlign: layout.footerAlign,
    sectionStyles: layout.sectionStyles,
    topPaddingLines: layout.topPaddingLines,
    feedLines: layout.feedLines,
    showTable: layout.showTable,
    showDateTime: layout.showDateTime,
    showBillId: layout.showBillId,
    showTaxBreakup: layout.showTaxBreakup,
    showPaymentSplit: layout.showPaymentSplit,
    showDiscountTip: layout.showDiscountTip,
    showNcReprintRevision: layout.showNcReprintRevision,
    header: layout.billHeader,
    footer: layout.billFooter
  };
}
