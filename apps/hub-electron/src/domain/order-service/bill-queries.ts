import { desc, eq } from "drizzle-orm";

import type { HubOrm } from "../../db/database.js";
import { bills } from "../../db/drizzle-schema.js";
import type { BillRow } from "./types.js";

const billSelection = {
  id: bills.id,
  bill_number: bills.billNumber,
  order_id: bills.orderId,
  status: bills.status,
  subtotal_paise: bills.subtotalPaise,
  tax_paise: bills.taxPaise,
  total_paise: bills.totalPaise,
  discount_paise: bills.discountPaise,
  tip_paise: bills.tipPaise,
  final_total_paise: bills.finalTotalPaise,
  tax_breakdown_json: bills.taxBreakdownJson,
  revision_number: bills.revisionNumber,
  print_count: bills.printCount,
  is_nc: bills.isNc,
  nc_reason: bills.ncReason,
  created_at: bills.createdAt
};

export function getBillById(orm: HubOrm, billId: string): BillRow | undefined {
  return orm.select(billSelection).from(bills).where(eq(bills.id, billId)).get();
}

export function getLatestBillForOrder(orm: HubOrm, orderId: string): BillRow | undefined {
  return orm.select(billSelection).from(bills).where(eq(bills.orderId, orderId)).orderBy(desc(bills.createdAt)).get();
}
