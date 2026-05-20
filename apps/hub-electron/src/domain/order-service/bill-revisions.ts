import type { HubOrm } from "../../db/database.js";
import { billRevisions } from "../../db/drizzle-schema.js";
import { makeId } from "../ids.js";
import type { BillTotals } from "./types.js";

export function recordBillRevision(
  orm: HubOrm,
  billId: string,
  revisionNumber: number,
  totals: BillTotals,
  reason: string,
  changedBy: string,
  now: string,
  financials: { discountPaise: number; tipPaise: number; finalTotalPaise: number } = {
    discountPaise: 0,
    tipPaise: 0,
    finalTotalPaise: totals.totalPaise
  }
): void {
  orm
    .insert(billRevisions)
    .values({
      id: makeId("billrev"),
      billId,
      revisionNumber,
      subtotalPaise: totals.subtotalPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      discountPaise: financials.discountPaise,
      tipPaise: financials.tipPaise,
      finalTotalPaise: financials.finalTotalPaise,
      taxBreakdownJson: JSON.stringify(totals.taxBreakdown),
      reason,
      approvedBy: changedBy,
      createdAt: now
    })
    .run();
}
