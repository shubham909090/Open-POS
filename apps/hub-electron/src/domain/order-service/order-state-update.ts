import type { DomainEvent, UpdateOrderStateInput } from "@gaurav-pos/shared";
import { eq } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { bills, orders, restaurantTables } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
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

type OrderStateUpdateResult = {
  orderId: string;
  status: string;
  totalPaise: number;
  kotIds: string[];
  printJobIds: string[];
  billId?: string;
  revisionNumber?: number;
};

export type OrderStateUpdateContext = {
  orm: HubOrm;
  db: SqliteDatabase;
  requireOrderById: (orderId: string) => OrderRow;
  requireTable: (tableId: string) => TableRow;
  verifyManagerApproval: (
    input: UpdateOrderStateInput["managerApproval"],
    action: string,
    aggregateType: string,
    aggregateId: string,
    requestedBy?: string
  ) => void;
  getOrderItems: (orderId: string) => OrderItemRow[];
  prepareSubmittedItems: (
    items: UpdateOrderStateInput["items"],
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
  calculateBillTotals: (items: OrderItemRow[]) => BillTotals;
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
  getBillForOrder: (orderId: string) => BillRow | undefined;
  getBillPaidPaise: (billId: string) => number;
  deleteLocalBillRecord: (billId: string) => void;
  recordBillRevision: (
    billId: string,
    revisionNumber: number,
    totals: BillTotals,
    reason: string,
    changedBy: string,
    now: string,
    financials: { discountPaise: number; tipPaise: number; finalTotalPaise: number }
  ) => void;
  freeTable: (tableId: string) => void;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function updateOrderState(ctx: OrderStateUpdateContext, orderId: string, input: UpdateOrderStateInput): OrderStateUpdateResult {
  const run = ctx.db.transaction(() => {
    const order = ctx.requireOrderById(orderId);
    if (!["open", "billed"].includes(order.status)) throw new DomainError("Order cannot be edited");
    if (order.status === "billed") {
      ctx.verifyManagerApproval(input.managerApproval, "order_state.update_billed", "order", orderId, input.managerApproval?.approvedBy ?? "captain");
    }

    const table = ctx.requireTable(order.table_id);
    const now = new Date().toISOString();
    const previousItems = ctx.getOrderItems(orderId);
    const previousVariantIds = new Set(previousItems.map((item) => item.menu_item_variant_id).filter((id): id is string => Boolean(id)));
    const previousItemsById = new Map(previousItems.map((item) => [item.id, item]));
    const normalizedItems = ctx.prepareSubmittedItems(input.items, previousVariantIds, previousItemsById);
    const menuById = ctx.getMenuItems([
      ...normalizedItems.map((item) => item.menuItemId).filter((id): id is string => Boolean(id)),
      ...previousItems.map((item) => item.menu_item_id).filter((id): id is string => Boolean(id))
    ]);
    const changes = ctx.applyOrderItemDiff(orderId, normalizedItems, previousItems, menuById, now, true);
    const activeItems = ctx.getOrderItems(orderId).filter((item) => item.quantity > 0 && item.status !== "cancelled");
    if (order.status !== "billed" && activeItems.length === 0) {
      throw new DomainError("Running table must keep at least one item. Use Cancel order instead.");
    }

    const totals = ctx.calculateBillTotals(activeItems);
    const shouldPrint = input.saveMode === "save_print";
    const tickets = shouldPrint
      ? ctx.createKotsForChanges(order, table, changes, now, false, false, order.status === "billed" ? input.managerApproval?.reason : undefined, undefined, undefined, true)
      : { kotIds: [], printJobIds: [] };

    if (order.status === "billed") {
      return updateBilledOrderState(ctx, orderId, input, order, table, activeItems, totals, tickets, now);
    }

    if (activeItems.length === 0) {
      ctx.orm.update(orders).set({ status: "cancelled", updatedAt: now }).where(eq(orders.id, orderId)).run();
      ctx.freeTable(table.id);
    } else {
      ctx.orm.update(orders).set({ status: "open", updatedAt: now }).where(eq(orders.id, orderId)).run();
      ctx.orm.update(restaurantTables).set({ status: "occupied", currentOrderId: orderId }).where(eq(restaurantTables.id, table.id)).run();
    }

    const status = activeItems.length === 0 ? "cancelled" : "open";
    ctx.appendEvent("order_state.updated", "order", orderId, { orderId, saveMode: input.saveMode, status, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds });
    return { orderId, status, totalPaise: totals.totalPaise, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds };
  });

  return run();
}

function updateBilledOrderState(
  ctx: OrderStateUpdateContext,
  orderId: string,
  input: UpdateOrderStateInput,
  order: OrderRow,
  table: TableRow,
  activeItems: OrderItemRow[],
  totals: BillTotals,
  tickets: TicketCreationResult,
  now: string
): OrderStateUpdateResult {
  const bill = ctx.getBillForOrder(orderId);
  if (!bill) throw new DomainError("Bill not found", 404);

  if (activeItems.length === 0) {
    const paidPaise = ctx.getBillPaidPaise(bill.id);
    if (paidPaise > 0) throw new DomainError("Remove or reverse recorded payments before removing all billed items");
    ctx.deleteLocalBillRecord(bill.id);
    ctx.orm.update(orders).set({ status: "cancelled", updatedAt: now }).where(eq(orders.id, orderId)).run();
    ctx.freeTable(table.id);
    ctx.appendEvent("order_state.updated", "order", orderId, {
      orderId,
      saveMode: input.saveMode,
      status: "cancelled",
      removedBillId: bill.id,
      kotIds: tickets.kotIds,
      printJobIds: tickets.printJobIds
    });
    return { orderId, status: "cancelled", totalPaise: 0, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds };
  }

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
    .where(eq(bills.id, bill.id))
    .run();
  ctx.recordBillRevision(bill.id, revisionNumber, totals, input.managerApproval?.reason ?? "Bill state updated", input.managerApproval?.approvedBy ?? "manager", now, {
    discountPaise: bill.discount_paise,
    tipPaise: bill.tip_paise,
    finalTotalPaise
  });
  ctx.orm.update(orders).set({ status: "billed", updatedAt: now }).where(eq(orders.id, orderId)).run();
  ctx.orm.update(restaurantTables).set({ status: "billed" }).where(eq(restaurantTables.id, table.id)).run();
  ctx.appendEvent("order_state.updated", "order", orderId, { orderId, saveMode: input.saveMode, billId: bill.id, revisionNumber, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds });
  return { orderId, status: order.status, totalPaise: totals.totalPaise, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds, billId: bill.id, revisionNumber };
}
