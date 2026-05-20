import type { BillAdjustmentInput, BillPrinterSlot, DomainEvent, SettleBillInput } from "@gaurav-pos/shared";
import { eq, sql } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { bills, orders, payments, restaurantTables } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import { renderBillTicketForPrint, type BillTicket } from "../tickets.js";
import { calculateDiscountPaise } from "./billing-calculations.js";
import type { BillRow, BillTotals, OrderItemRow, OrderRow, TableRow } from "./types.js";

type BillPrinterTarget = {
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
};

type GenerateBillResult = {
  billId: string;
  billNumber: number;
  totalPaise: number;
  finalTotalPaise: number;
  printJobId: string;
};

type SettleBillResult = {
  billId: string;
  status: string;
  paidPaise: number;
  remainingPaise: number;
  finalTotalPaise: number;
};

export type BillLifecycleContext = {
  orm: HubOrm;
  db: SqliteDatabase;
  requireEditableOrder: (orderId: string) => OrderRow;
  requireOrderById: (orderId: string) => OrderRow;
  requireTable: (tableId: string) => TableRow;
  getOrderItems: (orderId: string) => OrderItemRow[];
  calculateBillTotals: (items: OrderItemRow[]) => BillTotals;
  nextBillNumber: () => number;
  recordBillRevision: (
    billId: string,
    revisionNumber: number,
    totals: BillTotals,
    reason: string,
    changedBy: string,
    now: string,
    financials: { discountPaise: number; tipPaise: number; finalTotalPaise: number }
  ) => void;
  getBillById: (billId: string) => BillRow | undefined;
  resolveBillPrinter: (slot: BillPrinterSlot) => BillPrinterTarget;
  buildBillTicket: (input: { bill: BillRow; tableName: string; createdAt: string }) => BillTicket;
  enqueuePrintJob: (input: {
    targetType: "BILL";
    targetId: string;
    productionUnitId: null;
    printerHost: string | null;
    printerPort: number | null;
    printerName: string | null;
    payload: string;
  }) => string;
  getBillPaidPaise: (billId: string) => number;
  deductAlcoholStockForPaidBill: (billId: string, orderId: string) => void;
  freeTable: (tableId: string) => void;
  finalizeCompletedBusinessDays: () => void;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function generateBill(ctx: BillLifecycleContext, orderId: string, printerSlot: BillPrinterSlot = "default", input: BillAdjustmentInput = {}): GenerateBillResult {
  const run = ctx.db.transaction(() => {
    const order = ctx.requireEditableOrder(orderId);
    const table = ctx.requireTable(order.table_id);
    const items = ctx.getOrderItems(orderId).filter((item) => item.quantity > 0);
    if (items.length === 0) throw new DomainError("Cannot bill an empty order");

    const totals = ctx.calculateBillTotals(items);
    const discountPaise = input.discountValue === undefined ? 0 : calculateDiscountPaise(totals.totalPaise, input);
    const tipPaise = input.tipPaise ?? 0;
    const finalTotalPaise = Math.max(0, totals.totalPaise - discountPaise + tipPaise);
    const billId = makeId("bill");
    const billNumber = ctx.nextBillNumber();
    const now = new Date().toISOString();

    ctx.orm
      .insert(bills)
      .values({
        id: billId,
        billNumber,
        orderId,
        status: "pending",
        subtotalPaise: totals.subtotalPaise,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
        discountPaise,
        tipPaise,
        finalTotalPaise,
        taxBreakdownJson: JSON.stringify(totals.taxBreakdown),
        revisionNumber: 1,
        createdAt: now
      })
      .run();

    ctx.orm.update(orders).set({ status: "billed", updatedAt: now }).where(eq(orders.id, orderId)).run();
    ctx.orm.update(restaurantTables).set({ status: "billed" }).where(eq(restaurantTables.id, table.id)).run();
    ctx.recordBillRevision(billId, 1, totals, "Initial bill", "captain", now, {
      discountPaise,
      tipPaise,
      finalTotalPaise
    });
    const bill = ctx.getBillById(billId);
    if (!bill) throw new DomainError("Bill not found after generation", 500);
    const printJobId = ctx.enqueuePrintJob({
      targetType: "BILL",
      targetId: billId,
      productionUnitId: null,
      ...ctx.resolveBillPrinter(printerSlot),
      payload: renderBillTicketForPrint(ctx.buildBillTicket({ bill, tableName: table.name, createdAt: now }))
    });
    ctx.orm.update(bills).set({ printCount: sql`${bills.printCount} + 1` }).where(eq(bills.id, billId)).run();

    ctx.appendEvent("bill.generated", "bill", billId, { orderId, billNumber, totalPaise: totals.totalPaise, discountPaise, tipPaise, finalTotalPaise, taxBreakdown: totals.taxBreakdown, printJobId });
    return { billId, billNumber, totalPaise: totals.totalPaise, finalTotalPaise, printJobId };
  });

  return run();
}

export function settleBill(ctx: BillLifecycleContext, billId: string, input: SettleBillInput): SettleBillResult {
  const run = ctx.db.transaction(() => {
    const bill = ctx.getBillById(billId);
    if (!bill) throw new DomainError("Bill not found", 404);
    if (bill.status !== "pending") throw new DomainError("Bill is not pending");

    const order = ctx.requireOrderById(bill.order_id);
    const now = new Date().toISOString();
    const discountPaise = input.discountValue === undefined ? bill.discount_paise : calculateDiscountPaise(bill.total_paise, input);
    const tipPaise = input.tipPaise === undefined ? (bill.tip_paise ?? 0) : input.tipPaise;
    const finalTotalPaise = Math.max(0, bill.total_paise - discountPaise + tipPaise);
    const existingPaid = ctx.getBillPaidPaise(billId);
    const requestedPayments =
      input.payments && input.payments.length > 0
        ? input.payments
        : input.amountPaise !== undefined
          ? [{ method: input.method ?? "cash", amountPaise: input.amountPaise }]
          : [];

    const validPayments = requestedPayments.filter((payment) => payment.amountPaise > 0);
    const requestedPaymentTotalPaise = validPayments.reduce((sum, payment) => sum + payment.amountPaise, 0);
    if (existingPaid > finalTotalPaise) {
      throw new DomainError("Recorded payments exceed this bill total");
    }
    const balanceDuePaise = finalTotalPaise - existingPaid;
    if (requestedPaymentTotalPaise > balanceDuePaise) {
      throw new DomainError("Payment exceeds the balance due");
    }

    for (const payment of validPayments) {
      ctx.orm
        .insert(payments)
        .values({
          id: makeId("pay"),
          billId,
          method: payment.method ?? "cash",
          amountPaise: payment.amountPaise,
          receivedBy: input.receivedBy,
          reference: payment.reference ?? null,
          note: payment.note ?? null,
          createdAt: now
        })
        .run();
    }

    const paidPaise = existingPaid + requestedPaymentTotalPaise;
    const remainingPaise = Math.max(0, finalTotalPaise - paidPaise);
    const isPaid = remainingPaise === 0;

    ctx.orm
      .update(bills)
      .set({
        discountPaise,
        tipPaise,
        finalTotalPaise,
        status: isPaid ? "paid" : "pending",
        settledAt: isPaid ? now : null
      })
      .where(eq(bills.id, billId))
      .run();

    if (isPaid) {
      ctx.deductAlcoholStockForPaidBill(billId, bill.order_id);
      ctx.orm.update(orders).set({ status: "paid", updatedAt: now }).where(eq(orders.id, bill.order_id)).run();
      ctx.freeTable(order.table_id);
      ctx.appendEvent("bill.settled", "bill", billId, { ...input, paidPaise, remainingPaise, finalTotalPaise });
    } else {
      ctx.appendEvent("payment.added", "bill", billId, { ...input, paidPaise, remainingPaise, finalTotalPaise });
    }

    return { billId, status: isPaid ? "paid" : "pending", paidPaise, remainingPaise, finalTotalPaise };
  });

  const result = run();
  if (result.status === "paid") ctx.finalizeCompletedBusinessDays();
  return result;
}
