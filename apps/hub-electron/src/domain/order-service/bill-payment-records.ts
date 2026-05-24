import type { BillAdjustmentInput, HistoryEditBillInput } from "@gaurav-pos/shared";
import { and, eq, sum } from "drizzle-orm";
import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { billRevisions, bills, payments, printJobs } from "../../db/drizzle-schema.js";
import { queueCloudBackupTombstone } from "../../sync/backup-tombstones.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import { allocateByWeight, calculateDiscountPaise } from "./billing-calculations.js";
import type { BillRow } from "./types.js";

function queuePaymentBackupTombstones(db: SqliteDatabase, billId: string, deletedAt: string): void {
  const deletedPayments = db
    .prepare(
      `SELECT pay.id, pd.business_date
       FROM payments pay
       JOIN bills b ON b.id = pay.bill_id
       JOIN orders o ON o.id = b.order_id
       JOIN pos_days pd ON pd.id = o.pos_day_id
       WHERE pay.bill_id = ?`
    )
    .all(billId) as Array<{ id: string; business_date: string }>;
  for (const payment of deletedPayments) {
    queueCloudBackupTombstone(db, { domain: "payments", localId: payment.id, businessDate: payment.business_date, deletedAt });
  }
}

export function getBillPaidPaise(orm: HubOrm, billId: string): number {
  const row = orm.select({ paid: sum(payments.amountPaise) }).from(payments).where(eq(payments.billId, billId)).get();
  return Number(row?.paid ?? 0);
}

export function syncPaidBillPaymentToFinalTotal(
  orm: HubOrm,
  db: SqliteDatabase,
  bill: BillRow | undefined,
  billId: string,
  finalTotalPaise: number,
  receivedBy: string,
  now: string
): void {
  if (!bill || bill.status !== "paid" || bill.is_nc) return;
  const existingPayments = db
    .prepare("SELECT method, amount_paise, reference, note FROM payments WHERE bill_id = ? ORDER BY created_at ASC, id ASC")
    .all(billId) as Array<{ method: "cash" | "upi" | "card" | "online"; amount_paise: number; reference: string | null; note: string | null }>;
  queuePaymentBackupTombstones(db, billId, now);
  db.prepare("DELETE FROM payments WHERE bill_id = ?").run(billId);
  if (finalTotalPaise <= 0) return;
  const weights = existingPayments.length ? existingPayments.map((payment) => payment.amount_paise) : [finalTotalPaise];
  const allocated = allocateByWeight(finalTotalPaise, weights);
  const sourcePayments = existingPayments.length
    ? existingPayments
    : [{ method: "cash" as const, amount_paise: finalTotalPaise, reference: null, note: "Auto-adjusted after history edit" }];
  for (const [index, source] of sourcePayments.entries()) {
    const amountPaise = allocated[index] ?? 0;
    if (amountPaise <= 0) continue;
    orm.insert(payments).values({
      id: makeId("pay"),
      billId,
      method: source.method,
      amountPaise,
      receivedBy,
      reference: source.reference,
      note: source.note ?? "Auto-adjusted after history edit",
      createdAt: now
    }).run();
  }
}

export function replaceHistoryEditPayments(
  orm: HubOrm,
  db: SqliteDatabase,
  bill: BillRow,
  requestedPayments: HistoryEditBillInput["payments"],
  finalTotalPaise: number,
  receivedBy: string,
  now: string
): void {
  const billId = bill.id;
  if (bill.is_nc) {
    if (requestedPayments?.some((payment) => payment.amountPaise > 0)) {
      throw new DomainError("NC bills cannot record collected payments");
    }
    queuePaymentBackupTombstones(db, billId, now);
    orm.delete(payments).where(eq(payments.billId, billId)).run();
    return;
  }
  if (bill.status !== "paid") return;
  if (!requestedPayments) {
    throw new DomainError("History edit payments must exactly match the edited bill total");
  }
  const normalizedPayments = requestedPayments.filter((payment) => payment.amountPaise > 0);
  if (requestedPayments.some((payment) => payment.amountPaise < 0)) {
    throw new DomainError("Payment amount cannot be negative");
  }
  const paymentTotalPaise = normalizedPayments.reduce((total, payment) => total + payment.amountPaise, 0);
  if (paymentTotalPaise !== finalTotalPaise) {
    throw new DomainError("History edit payments must exactly match the edited bill total");
  }
  queuePaymentBackupTombstones(db, billId, now);
  orm.delete(payments).where(eq(payments.billId, billId)).run();
  for (const payment of normalizedPayments) {
    orm.insert(payments).values({
      id: makeId("pay"),
      billId,
      method: payment.method ?? "cash",
      amountPaise: payment.amountPaise,
      receivedBy,
      reference: payment.reference ?? null,
      note: payment.note ?? "Owner history edit",
      createdAt: now
    }).run();
  }
}

export function deleteLocalBillRecord(orm: HubOrm, billId: string): void {
  orm.delete(payments).where(eq(payments.billId, billId)).run();
  orm.delete(billRevisions).where(eq(billRevisions.billId, billId)).run();
  orm.delete(printJobs).where(and(eq(printJobs.targetType, "BILL"), eq(printJobs.targetId, billId))).run();
  orm.delete(bills).where(eq(bills.id, billId)).run();
}

export function applyBillAdjustments(
  orm: HubOrm,
  db: SqliteDatabase,
  bill: BillRow | undefined,
  input: BillAdjustmentInput,
  requestedBy: string,
  mode: "any" | "pending_only" = "any"
): void {
  if (input.discountValue === undefined && input.tipPaise === undefined) return;
  if (!bill) throw new DomainError("Bill not found", 404);
  if (mode === "pending_only" && bill.status !== "pending") {
    throw new DomainError("Paid bill discounts can only be changed from Order History with Master PIN");
  }
  const now = new Date().toISOString();
  const discountPaise = input.discountValue === undefined ? bill.discount_paise : calculateDiscountPaise(bill.total_paise, input);
  const tipPaise = input.tipPaise === undefined ? bill.tip_paise : input.tipPaise;
  const finalTotalPaise = Math.max(0, bill.total_paise - discountPaise + tipPaise);
  if (getBillPaidPaise(orm, bill.id) > finalTotalPaise) {
    throw new DomainError("Recorded payments exceed adjusted bill total");
  }
  orm.update(bills).set({ discountPaise, tipPaise, finalTotalPaise }).where(eq(bills.id, bill.id)).run();
  syncPaidBillPaymentToFinalTotal(orm, db, bill, bill.id, finalTotalPaise, requestedBy, now);
}
