import { calculateLineTotal, type ModifiedBillsQueryInput } from "@gaurav-pos/shared";
import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { billModificationAudits } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import type { BillRow, DeviceActor, OrderItemRow, OrderRow, TableRow } from "./types.js";

export type BillModificationChangeType = "pending_revision" | "history_edit";
export type BillModificationApprovalType = "manager" | "master";

type AuditItem = {
  orderItemId: string;
  menuItemId: string | null;
  menuItemVariantId: string | null;
  name: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
};

type AuditPayment = {
  method: string;
  amountPaise: number;
  reference: string | null;
};

export type BillModificationSnapshot = {
  status: string;
  revisionNumber: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  discountPaise: number;
  tipPaise: number;
  finalTotalPaise: number;
  items: AuditItem[];
  payments: AuditPayment[];
};

export type BillModificationDiff = Array<{
  kind: "item_added" | "item_removed" | "item_quantity" | "item_price" | "payment_added" | "payment_removed" | "payment_changed" | "discount" | "tip" | "final_total" | "revision";
  label: string;
  before: string;
  after: string;
}>;

type RecordBillModificationAuditInput = {
  bill: BillRow;
  order: OrderRow;
  table: TableRow;
  changeType: BillModificationChangeType;
  approvalType: BillModificationApprovalType;
  reason: string;
  approvedBy: string;
  actor: DeviceActor;
  before: BillModificationSnapshot;
  after: BillModificationSnapshot;
  createdAt: string;
};

const systemActor: DeviceActor = { id: "system", name: "System", role: "admin" };

export function billModificationActor(actor?: DeviceActor): DeviceActor {
  return actor ?? systemActor;
}

export function buildBillModificationSnapshot(db: SqliteDatabase, bill: BillRow, items: OrderItemRow[]): BillModificationSnapshot {
  const payments = db
    .prepare("SELECT method, amount_paise, reference FROM payments WHERE bill_id = ? ORDER BY created_at ASC, id ASC")
    .all(bill.id) as Array<{ method: string; amount_paise: number; reference: string | null }>;

  return {
    status: bill.status,
    revisionNumber: bill.revision_number,
    subtotalPaise: bill.subtotal_paise,
    taxPaise: bill.tax_paise,
    totalPaise: bill.total_paise,
    discountPaise: bill.discount_paise,
    tipPaise: bill.tip_paise,
    finalTotalPaise: bill.final_total_paise,
    items: items
      .filter((item) => item.quantity > 0 && item.status !== "cancelled")
      .map((item) => ({
        orderItemId: item.id,
        menuItemId: item.menu_item_id,
        menuItemVariantId: item.menu_item_variant_id,
        name: item.name_snapshot,
        quantity: item.quantity,
        unitPricePaise: item.unit_price_paise,
        lineTotalPaise: calculateLineTotal(item.unit_price_paise, item.quantity)
      })),
    payments: payments.map((payment) => ({
      method: payment.method,
      amountPaise: payment.amount_paise,
      reference: payment.reference
    }))
  };
}

export function recordBillModificationAudit(orm: HubOrm, input: RecordBillModificationAuditInput): void {
  const day = orm.$client.prepare("SELECT business_date FROM pos_days WHERE id = ?").get(input.order.pos_day_id) as { business_date: string } | undefined;
  if (!day) throw new DomainError("Business day not found for bill audit", 500);

  orm
    .insert(billModificationAudits)
    .values({
      id: makeId("billaudit"),
      billId: input.bill.id,
      orderId: input.order.id,
      posDayId: input.order.pos_day_id,
      businessDate: day.business_date,
      billNumber: input.bill.bill_number,
      tableNameSnapshot: input.table.name,
      changeType: input.changeType,
      fromRevisionNumber: input.before.revisionNumber,
      toRevisionNumber: input.after.revisionNumber,
      reason: input.reason,
      approvalType: input.approvalType,
      approvedBy: input.approvedBy,
      actorDeviceId: input.actor.id,
      actorDeviceName: input.actor.name,
      actorRole: input.actor.role,
      beforeJson: JSON.stringify(input.before),
      afterJson: JSON.stringify(input.after),
      diffJson: JSON.stringify(buildBillModificationDiff(input.before, input.after)),
      createdAt: input.createdAt
    })
    .run();
}

export function listModifiedBillAudits(db: SqliteDatabase, input: ModifiedBillsQueryInput): unknown {
  const search = input.exactSearch?.trim();
  const params: Array<string | number> = [input.from, input.to];
  const searchSql = search ? exactSearchSql(search, params) : "";
  const rows = db
    .prepare(
      `SELECT *
       FROM bill_modification_audits
       WHERE business_date BETWEEN ? AND ?
       ${searchSql}
       ORDER BY created_at DESC, id DESC
       LIMIT 250`
    )
    .all(...params) as Array<{
      id: string;
      bill_id: string;
      order_id: string;
      business_date: string;
      bill_number: number;
      table_name_snapshot: string;
      change_type: string;
      from_revision_number: number;
      to_revision_number: number;
      reason: string;
      approval_type: string;
      approved_by: string;
      actor_device_id: string;
      actor_device_name: string;
      actor_role: string;
      before_json: string;
      after_json: string;
      diff_json: string;
      created_at: string;
    }>;

  return {
    from: input.from,
    to: input.to,
    rows: rows.map((row) => ({
      id: row.id,
      billId: row.bill_id,
      orderId: row.order_id,
      businessDate: row.business_date,
      billNumber: row.bill_number,
      tableName: row.table_name_snapshot,
      changeType: row.change_type,
      fromRevisionNumber: row.from_revision_number,
      toRevisionNumber: row.to_revision_number,
      reason: row.reason,
      approvalType: row.approval_type,
      approvedBy: row.approved_by,
      actor: {
        deviceId: row.actor_device_id,
        name: row.actor_device_name,
        role: row.actor_role
      },
      before: parseSnapshot(row.before_json),
      after: parseSnapshot(row.after_json),
      changes: parseDiff(row.diff_json),
      createdAt: row.created_at
    }))
  };
}

function exactSearchSql(search: string, params: Array<string | number>): string {
  params.push(search, search);
  if (/^\d+$/.test(search)) {
    params.push(Number(search));
    return "AND (bill_id = ? OR order_id = ? OR bill_number = ?)";
  }
  return "AND (bill_id = ? OR order_id = ?)";
}

function buildBillModificationDiff(before: BillModificationSnapshot, after: BillModificationSnapshot): BillModificationDiff {
  const changes: BillModificationDiff = [];
  const beforeItems = new Map(before.items.map((item) => [item.orderItemId, item]));
  const afterItems = new Map(after.items.map((item) => [item.orderItemId, item]));
  const itemIds = new Set([...beforeItems.keys(), ...afterItems.keys()]);

  for (const itemId of itemIds) {
    const oldItem = beforeItems.get(itemId);
    const newItem = afterItems.get(itemId);
    const label = newItem?.name ?? oldItem?.name ?? "Item";
    if (!oldItem && newItem) changes.push({ kind: "item_added", label, before: "0", after: String(newItem.quantity) });
    else if (oldItem && !newItem) changes.push({ kind: "item_removed", label, before: String(oldItem.quantity), after: "0" });
    else if (oldItem && newItem && oldItem.quantity !== newItem.quantity) changes.push({ kind: "item_quantity", label, before: String(oldItem.quantity), after: String(newItem.quantity) });
    if (oldItem && newItem && oldItem.unitPricePaise !== newItem.unitPricePaise) changes.push({ kind: "item_price", label, before: String(oldItem.unitPricePaise), after: String(newItem.unitPricePaise) });
  }

  pushMoneyChange(changes, "discount", "Discount", before.discountPaise, after.discountPaise);
  pushMoneyChange(changes, "tip", "Tip", before.tipPaise, after.tipPaise);
  pushPaymentChanges(changes, before.payments, after.payments);
  pushMoneyChange(changes, "final_total", "Final total", before.finalTotalPaise, after.finalTotalPaise);
  if (before.revisionNumber !== after.revisionNumber) changes.push({ kind: "revision", label: "Revision", before: String(before.revisionNumber), after: String(after.revisionNumber) });
  return changes;
}

function pushMoneyChange(changes: BillModificationDiff, kind: BillModificationDiff[number]["kind"], label: string, before: number, after: number): void {
  if (before !== after) changes.push({ kind, label, before: String(before), after: String(after) });
}

function pushPaymentChanges(changes: BillModificationDiff, before: AuditPayment[], after: AuditPayment[]): void {
  const beforeByEntry = paymentTotalsByEntry(before);
  const afterByEntry = paymentTotalsByEntry(after);
  const entries = new Set([...beforeByEntry.keys(), ...afterByEntry.keys()]);
  for (const entry of entries) {
    const oldTotal = beforeByEntry.get(entry) ?? 0;
    const newTotal = afterByEntry.get(entry) ?? 0;
    if (oldTotal === newTotal) continue;
    changes.push({
      kind: oldTotal === 0 ? "payment_added" : newTotal === 0 ? "payment_removed" : "payment_changed",
      label: paymentLabelFromKey(entry),
      before: String(oldTotal),
      after: String(newTotal)
    });
  }
}

function paymentTotalsByEntry(payments: AuditPayment[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const payment of payments) {
    const key = paymentKey(payment);
    totals.set(key, (totals.get(key) ?? 0) + payment.amountPaise);
  }
  return totals;
}

function paymentKey(payment: AuditPayment): string {
  return JSON.stringify([payment.method, payment.reference ?? ""]);
}

function paymentLabelFromKey(key: string): string {
  const [method, reference] = JSON.parse(key) as [string, string];
  return reference ? `${method} (${reference})` : method;
}

function parseSnapshot(value: string): BillModificationSnapshot {
  return JSON.parse(value) as BillModificationSnapshot;
}

function parseDiff(value: string): BillModificationDiff {
  return JSON.parse(value) as BillModificationDiff;
}
