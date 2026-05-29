import type {
  BillPrinterSlot,
  DomainEvent,
  HistoryEditBillInput,
  MarkNcBillInput,
  ReprintBillInput,
  ReviseBillInput
} from "@gaurav-pos/shared";
import { eq, sql } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { bills, orders, restaurantTables } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { renderBillTicketForPrint, type BillTicket } from "../tickets.js";
import { calculateAlcoholUsageForItems, type AlcoholUsage } from "./alcohol-usage.js";
import { calculateDiscountPaise } from "./billing-calculations.js";
import type {
  BillRow,
  BillTotals,
  KotItemChange,
  MenuItemRow,
  OrderItemRow,
  OrderRow,
  RequestedOrderItem,
  TableRow,
  TicketCreationResult
} from "./types.js";

type PrintTarget = {
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
};

type PrintJobInput = PrintTarget & {
  targetType: "KOT" | "BOT" | "BILL";
  targetId: string;
  productionUnitId: string | null;
  payload: string;
};

type ReviseBillResult = {
  billId: string;
  revisionNumber: number;
  totalPaise: number;
  kotIds: string[];
  printJobIds: string[];
};

type HistoryEditBillResult = {
  billId: string;
  revisionNumber: number;
  totalPaise: number;
  printJobId: string;
  modified: boolean;
};

export type BillActionContext = {
  orm: HubOrm;
  db: SqliteDatabase;
  verifyManagerApproval: (
    input: ReprintBillInput["managerApproval"] | MarkNcBillInput["managerApproval"] | ReviseBillInput["managerApproval"],
    action: string,
    aggregateType: string,
    aggregateId: string,
    requestedBy?: string
  ) => void;
  verifyMasterApproval: (
    input: HistoryEditBillInput["masterApproval"],
    action: string,
    aggregateType: string,
    aggregateId: string,
    requestedBy?: string
  ) => void;
  applyBillAdjustments: (billId: string, input: MarkNcBillInput | ReprintBillInput, requestedBy: string, mode?: "any" | "pending_only") => void;
  enqueueBillReprint: (billId: string, suffix: string, printerSlot?: BillPrinterSlot) => string;
  getBillById: (billId: string) => BillRow | undefined;
  getBillPaidPaise: (billId: string) => number;
  requireOrderById: (orderId: string) => OrderRow;
  requireTable: (tableId: string) => TableRow;
  getOrderItems: (orderId: string) => OrderItemRow[];
  prepareSubmittedItems: (
    items: ReviseBillInput["items"] | HistoryEditBillInput["items"],
    allowedInactiveVariantIds?: Set<string>,
    previousItemsById?: Map<string, OrderItemRow>
  ) => RequestedOrderItem[];
  getMenuItems: (ids: string[]) => Map<string, MenuItemRow>;
  applyOrderItemDiff: (
    orderId: string,
    requestedItems: RequestedOrderItem[],
    previousItems: OrderItemRow[],
    menuById: Map<string, MenuItemRow>,
    now: string,
    cancelMissing?: boolean
  ) => KotItemChange[];
  createKotsForChanges: (
    order: OrderRow,
    table: TableRow,
    changes: KotItemChange[],
    now: string,
    isNewOrder: boolean,
    forceCancelled: boolean,
    reason?: string,
    typeOverride?: "new" | "modified" | "cancelled" | "partial_cancel" | "table_shifted",
    sequenceOrderId?: string,
    printTickets?: boolean,
    note?: string
  ) => TicketCreationResult;
  calculateBillTotals: (items: OrderItemRow[]) => BillTotals;
  recordBillRevision: (
    billId: string,
    revisionNumber: number,
    totals: BillTotals,
    reason: string,
    changedBy: string,
    now: string,
    financials: { discountPaise: number; tipPaise: number; finalTotalPaise: number }
  ) => void;
  applyAlcoholUsageDeltaForHistoryEdit: (billId: string, before: AlcoholUsage, after: AlcoholUsage) => void;
  replaceHistoryEditPayments: (
    bill: BillRow,
    requestedPayments: HistoryEditBillInput["payments"],
    finalTotalPaise: number,
    receivedBy: string,
    now: string
  ) => void;
  resolveBillPrinter: (slot: BillPrinterSlot) => PrintTarget;
  buildBillTicket: (input: { bill: BillRow; tableName: string; createdAt: string; ncReason?: string | null }) => BillTicket;
  enqueuePrintJob: (input: PrintJobInput) => string;
  refreshDailyReportSnapshot: (posDayId: string, now?: string) => void;
  deductAlcoholStockForPaidBill: (billId: string, orderId: string) => void;
  freeTable: (tableId: string) => void;
  finalizeCompletedBusinessDays: () => void;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function reprintBill(ctx: BillActionContext, billId: string, input: ReprintBillInput): { printJobId: string } {
  const run = ctx.db.transaction(() => {
    ctx.verifyManagerApproval(input.managerApproval, "bill.reprint", "bill", billId, input.requestedBy);
    ctx.applyBillAdjustments(billId, input, input.requestedBy, "pending_only");
    const printJobId = ctx.enqueueBillReprint(billId, `REPRINT\nReason: ${input.reason}\nRequested by: ${input.requestedBy}\n`, input.printerSlot ?? "default");
    ctx.appendEvent("bill.reprinted", "bill", billId, { ...input, printJobId });
    return { printJobId };
  });

  return run();
}

export function reprintBillFromHistory(ctx: BillActionContext, billId: string, requestedBy: string, printerSlot: BillPrinterSlot = "default"): { printJobId: string } {
  const run = ctx.db.transaction(() => {
    const printJobId = ctx.enqueueBillReprint(billId, "", printerSlot);
    ctx.appendEvent("bill.history_reprinted", "bill", billId, { billId, requestedBy, reason: "history_reprint", printJobId });
    return { printJobId };
  });

  return run();
}

export function reviseBill(ctx: BillActionContext, billId: string, input: ReviseBillInput): ReviseBillResult {
  const run = ctx.db.transaction(() => {
    ctx.verifyManagerApproval(input.managerApproval, "bill.revise", "bill", billId, input.managerApproval.approvedBy);
    const bill = ctx.getBillById(billId);
    if (!bill) throw new DomainError("Bill not found", 404);
    if (bill.status !== "pending") throw new DomainError("Only pending printed bills can be revised");
    if (ctx.getBillPaidPaise(billId) > 0) throw new DomainError("Remove or reverse recorded payments before revising this bill");
    const order = ctx.requireOrderById(bill.order_id);
    if (!["billed", "open"].includes(order.status)) throw new DomainError("Order cannot be revised");
    const table = ctx.requireTable(order.table_id);
    const now = new Date().toISOString();
    const previousItems = ctx.getOrderItems(order.id);
    const previousVariantIds = new Set(previousItems.map((item) => item.menu_item_variant_id).filter((id): id is string => Boolean(id)));
    const previousItemsById = new Map(previousItems.map((item) => [item.id, item]));
    const normalizedItems = ctx.prepareSubmittedItems(input.items, previousVariantIds, previousItemsById);
    const menuById = ctx.getMenuItems([
      ...normalizedItems.map((item) => item.menuItemId).filter((id): id is string => Boolean(id)),
      ...previousItems.map((item) => item.menu_item_id).filter((id): id is string => Boolean(id))
    ]);
    const changes = ctx.applyOrderItemDiff(order.id, normalizedItems, previousItems, menuById, now, true);
    const tickets = ctx.createKotsForChanges(order, table, changes, now, false, false, input.managerApproval.reason);
    const totals = ctx.calculateBillTotals(ctx.getOrderItems(order.id).filter((item) => item.quantity > 0));
    const finalTotalPaise = Math.max(0, totals.totalPaise - bill.discount_paise + bill.tip_paise);
    const revisionNumber = (bill.revision_number ?? 1) + 1;

    ctx.orm
      .update(bills)
      .set({
        subtotalPaise: totals.subtotalPaise,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
        finalTotalPaise,
        taxBreakdownJson: JSON.stringify(totals.taxBreakdown),
        revisionNumber,
        status: "pending"
      })
      .where(eq(bills.id, billId))
      .run();
    ctx.orm.update(orders).set({ status: "billed", updatedAt: now }).where(eq(orders.id, order.id)).run();
    ctx.orm.update(restaurantTables).set({ status: "billed" }).where(eq(restaurantTables.id, table.id)).run();
    ctx.recordBillRevision(billId, revisionNumber, totals, input.managerApproval.reason, input.managerApproval.approvedBy, now, {
      discountPaise: bill.discount_paise,
      tipPaise: bill.tip_paise,
      finalTotalPaise
    });
    ctx.appendEvent("bill.revised", "bill", billId, {
      billId,
      revisionNumber,
      totalPaise: totals.totalPaise,
      kotIds: tickets.kotIds,
      printJobIds: tickets.printJobIds
    });
    return { billId, revisionNumber, totalPaise: totals.totalPaise, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds };
  });

  return run();
}

export function editHistoryBill(ctx: BillActionContext, billId: string, input: HistoryEditBillInput): HistoryEditBillResult {
  const run = ctx.db.transaction(() => {
    const bill = ctx.getBillById(billId);
    if (!bill) throw new DomainError("Bill not found", 404);
    if (bill.status !== "paid" && !bill.is_nc) {
      throw new DomainError("Only paid or NC bills can be edited from Order History");
    }
    ctx.verifyMasterApproval(input.masterApproval, "bill.history_edit", "bill", billId, input.masterApproval.approvedBy);
    const order = ctx.requireOrderById(bill.order_id);
    const table = ctx.requireTable(order.table_id);
    const now = new Date().toISOString();
    const previousItems = ctx.getOrderItems(order.id);
    const previousAlcoholUsage = calculateAlcoholUsageForItems(previousItems.filter((item) => item.quantity > 0 && item.status !== "cancelled"));
    const previousVariantIds = new Set(previousItems.map((item) => item.menu_item_variant_id).filter((id): id is string => Boolean(id)));
    const previousItemsById = new Map(previousItems.map((item) => [item.id, item]));
    const normalizedItems = ctx.prepareSubmittedItems(input.items, previousVariantIds, previousItemsById);
    const menuById = ctx.getMenuItems([
      ...normalizedItems.map((item) => item.menuItemId).filter((id): id is string => Boolean(id)),
      ...previousItems.map((item) => item.menu_item_id).filter((id): id is string => Boolean(id))
    ]);
    ctx.applyOrderItemDiff(order.id, normalizedItems, previousItems, menuById, now, true);
    const activeItems = ctx.getOrderItems(order.id).filter((item) => item.quantity > 0 && item.status !== "cancelled");
    if (activeItems.length === 0) throw new DomainError("History bill edit needs at least one item");
    const totals = ctx.calculateBillTotals(activeItems);
    const discountPaise = input.discountValue === undefined ? bill.discount_paise : calculateDiscountPaise(totals.totalPaise, input);
    const tipPaise = input.tipPaise === undefined ? bill.tip_paise : input.tipPaise;
    const finalTotalPaise = Math.max(0, totals.totalPaise - discountPaise + tipPaise);
    const revisionNumber = (bill.revision_number ?? 1) + 1;
    if (bill.status === "paid" || bill.is_nc) {
      ctx.applyAlcoholUsageDeltaForHistoryEdit(billId, previousAlcoholUsage, calculateAlcoholUsageForItems(activeItems));
    }

    ctx.orm
      .update(bills)
      .set({
        subtotalPaise: totals.subtotalPaise,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
        discountPaise,
        tipPaise,
        finalTotalPaise,
        taxBreakdownJson: JSON.stringify(totals.taxBreakdown),
        revisionNumber
      })
      .where(eq(bills.id, billId))
      .run();

    ctx.replaceHistoryEditPayments(bill, input.payments, finalTotalPaise, input.masterApproval.approvedBy, now);
    ctx.recordBillRevision(billId, revisionNumber, totals, input.masterApproval.reason, input.masterApproval.approvedBy, now, {
      discountPaise,
      tipPaise,
      finalTotalPaise
    });

    const updatedBill = ctx.getBillById(billId);
    if (!updatedBill) throw new DomainError("Bill not found after history edit", 500);
    const printJobId = ctx.enqueuePrintJob({
      targetType: "BILL",
      targetId: billId,
      productionUnitId: null,
      ...ctx.resolveBillPrinter(input.printerSlot ?? "default"),
      payload: renderBillTicketForPrint(ctx.buildBillTicket({ bill: updatedBill, tableName: table.name, createdAt: updatedBill.created_at }))
    });
    ctx.orm.update(bills).set({ printCount: sql`${bills.printCount} + 1` }).where(eq(bills.id, billId)).run();
    ctx.refreshDailyReportSnapshot(order.pos_day_id, now);
    ctx.appendEvent("bill.history_edited", "bill", billId, { billId, revisionNumber, totalPaise: totals.totalPaise, printJobId, modified: true });
    return { billId, revisionNumber, totalPaise: totals.totalPaise, printJobId, modified: true };
  });

  return run();
}

export function markBillNc(ctx: BillActionContext, billId: string, input: MarkNcBillInput): { billId: string; printJobId: string } {
  const run = ctx.db.transaction(() => {
    ctx.verifyManagerApproval(input.managerApproval, "bill.nc", "bill", billId, input.managerApproval.approvedBy);
    const bill = ctx.getBillById(billId);
    if (!bill) throw new DomainError("Bill not found", 404);
    if (bill.status !== "pending") throw new DomainError("Only unpaid bills can be marked NC");
    const existingPaid = ctx.getBillPaidPaise(billId);
    if (existingPaid > 0) throw new DomainError("Remove or reverse recorded payments before marking this bill NC");
    ctx.applyBillAdjustments(billId, input, input.managerApproval.approvedBy);
    const adjustedBill = ctx.getBillById(billId);
    if (!adjustedBill) throw new DomainError("Bill not found after adjustment", 500);
    const order = ctx.requireOrderById(bill.order_id);
    const table = ctx.requireTable(order.table_id);
    const now = new Date().toISOString();
    ctx.deductAlcoholStockForPaidBill(billId, order.id);
    ctx.orm
      .update(bills)
      .set({
        isNc: true,
        ncReason: input.managerApproval.reason,
        ncApprovedBy: input.managerApproval.approvedBy,
        ncMarkedAt: now,
        status: "paid",
        settledAt: now,
        printCount: sql`${bills.printCount} + 1`
      })
      .where(eq(bills.id, billId))
      .run();
    ctx.orm.update(orders).set({ status: "paid", updatedAt: now }).where(eq(orders.id, order.id)).run();
    ctx.freeTable(order.table_id);

    const printJobId = ctx.enqueuePrintJob({
      targetType: "BILL",
      targetId: billId,
      productionUnitId: null,
      ...ctx.resolveBillPrinter(input.printerSlot ?? "default"),
      payload: renderBillTicketForPrint(
        ctx.buildBillTicket({
          bill: adjustedBill,
          tableName: table.name,
          createdAt: adjustedBill.created_at,
          ncReason: input.managerApproval.reason
        })
      )
    });
    ctx.appendEvent("bill.nc_marked", "bill", billId, { billId, reason: input.managerApproval.reason, printJobId });
    return { billId, printJobId };
  });

  const result = run();
  ctx.finalizeCompletedBusinessDays();
  return result;
}

export function printBill(ctx: BillActionContext, billId: string, requestedBy: string, printerSlot: BillPrinterSlot = "default"): { printJobId: string } {
  const run = ctx.db.transaction(() => {
    const bill = ctx.getBillById(billId);
    if (!bill) throw new DomainError("Bill not found", 404);
    if (bill.print_count > 0) throw new DomainError("Bill was already printed. Use manager-approved reprint.");
    const order = ctx.requireOrderById(bill.order_id);
    const table = ctx.requireTable(order.table_id);
    const now = new Date().toISOString();
    const printJobId = ctx.enqueuePrintJob({
      targetType: "BILL",
      targetId: billId,
      productionUnitId: null,
      ...ctx.resolveBillPrinter(printerSlot),
      payload: renderBillTicketForPrint(
        ctx.buildBillTicket({
          bill,
          tableName: table.name,
          createdAt: bill.created_at
        })
      )
    });
    ctx.orm.update(bills).set({ printCount: sql`${bills.printCount} + 1` }).where(eq(bills.id, billId)).run();
    ctx.appendEvent("bill.printed", "bill", billId, { billId, requestedBy, printJobId });
    return { printJobId };
  });

  return run();
}
