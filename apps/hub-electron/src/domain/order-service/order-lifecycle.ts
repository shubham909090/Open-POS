import type { CancelOrderInput, CancelOrderItemsInput, DomainEvent, SubmitOrderInput } from "@gaurav-pos/shared";
import { eq, sql } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { orderItems, orders, restaurantTables } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import type {
  BusinessDayRow,
  DeviceActor,
  KotItemChange,
  MenuItemRow,
  OrderItemRow,
  OrderRow,
  RequestedOrderItem,
  TableRow,
  TicketCreationResult,
  UnitRow
} from "./types.js";

type CreateOrderInput = Pick<SubmitOrderInput, "tableId" | "pax" | "orderType"> & { captainId: string };
type OrderLifecycleResult = { orderId: string; kotIds: string[]; printJobIds: string[] };

export type OrderLifecycleContext = {
  orm: HubOrm;
  db: SqliteDatabase;
  finalizeCompletedBusinessDays: () => void;
  ensureCurrentBusinessDay: () => BusinessDayRow;
  requireTable: (tableId: string) => TableRow;
  requireEditableOrder: (orderId: string) => OrderRow;
  createOrder: (input: CreateOrderInput, posDayId: string, now: string, actor?: DeviceActor) => OrderRow;
  prepareSubmittedItems: (
    items: SubmitOrderInput["items"],
    allowedInactiveVariantIds?: Set<string>,
    previousItemsById?: Map<string, OrderItemRow>
  ) => RequestedOrderItem[];
  getOrderItems: (orderId: string) => OrderItemRow[];
  getMenuItems: (ids: string[]) => Map<string, MenuItemRow>;
  getUnits: (ids: string[]) => Map<string, UnitRow>;
  getOrderItemById: (orderItemId: string) => OrderItemRow | undefined;
  kotChangeFromOrderItem: (item: OrderItemRow, quantityDelta: number) => KotItemChange | null;
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
  verifyManagerApproval: (input: CancelOrderInput["managerApproval"], action: string, aggregateType: string, aggregateId: string, requestedBy?: string) => void;
  freeTable: (tableId: string) => void;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function submitOrder(ctx: OrderLifecycleContext, input: SubmitOrderInput, actor?: DeviceActor): OrderLifecycleResult {
  const run = ctx.db.transaction(() => {
    ctx.finalizeCompletedBusinessDays();
    const posDay = ctx.ensureCurrentBusinessDay();
    const table = ctx.requireTable(input.tableId);
    const now = new Date().toISOString();
    const normalizedItems = ctx.prepareSubmittedItems(input.items);
    const isNewOrder = !table.current_order_id;
    const order = table.current_order_id
      ? ctx.requireEditableOrder(table.current_order_id)
      : ctx.createOrder(orderInputForActor(input, actor), posDay.id, now, actor);
    assertCanEditOrder(order, actor);

    const previousItems = ctx.getOrderItems(order.id);
    const menuById = ctx.getMenuItems([
      ...normalizedItems.map((item) => item.menuItemId).filter((id): id is string => Boolean(id)),
      ...previousItems.map((item) => item.menu_item_id).filter((id): id is string => Boolean(id))
    ]);
    const changes = ctx.applyOrderItemDiff(order.id, normalizedItems, previousItems, menuById, now);
    const tickets = ctx.createKotsForChanges(order, table, changes, now, isNewOrder, false, undefined, undefined, undefined, (input.printMode ?? "kot_print") !== "kot", input.note);

    ctx.orm.update(orders).set({ pax: input.pax, updatedAt: now }).where(eq(orders.id, order.id)).run();
    ctx.orm
      .update(restaurantTables)
      .set({
        status: "occupied",
        currentOrderId: order.id,
        occupiedAt: sql`COALESCE(${restaurantTables.occupiedAt}, ${now})`
      })
      .where(eq(restaurantTables.id, table.id))
      .run();

    ctx.appendEvent("order.submitted", "order", order.id, {
      orderId: order.id,
      tableId: table.id,
      kotIds: tickets.kotIds,
      printJobIds: tickets.printJobIds
    });

    return { orderId: order.id, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds };
  });

  const result = run();
  ctx.finalizeCompletedBusinessDays();
  return result;
}

export function cancelOrder(ctx: OrderLifecycleContext, orderId: string, input: CancelOrderInput): OrderLifecycleResult {
  const run = ctx.db.transaction(() => {
    const reason = input.reason;
    const requestedBy = input.requestedBy;
    ctx.verifyManagerApproval(input.managerApproval, "order.cancel", "order", orderId, requestedBy);
    const order = ctx.requireEditableOrder(orderId);
    const table = ctx.requireTable(order.table_id);
    const now = new Date().toISOString();
    const items = ctx.getOrderItems(order.id).filter((item) => item.quantity > 0);
    const unitById = ctx.getUnits([...new Set(items.map((item) => item.production_unit_id).filter((id): id is string => Boolean(id)))]);

    const changes = items.flatMap((item): KotItemChange[] => {
      if (!item.production_unit_id) return [];
      const unit = unitById.get(item.production_unit_id);
      if (!unit) throw new DomainError(`Production unit missing for ${item.name_snapshot}`);

      return [{
        menuItemId: item.menu_item_id,
        orderItemId: item.id,
        name: item.name_snapshot,
        quantityDelta: -item.quantity,
        productionUnitId: item.production_unit_id,
        productionUnitName: unit.name,
        printerHost: unit.printer_host,
        printerPort: unit.printer_port,
        printerName: unit.printer_name,
        ticketLabel: item.ticket_label_snapshot as "KOT" | "BOT"
      }];
    });

    const tickets = ctx.createKotsForChanges(order, table, changes, now, false, true, reason);
    ctx.orm.update(orders).set({ status: "cancelled", updatedAt: now }).where(eq(orders.id, order.id)).run();
    ctx.orm.update(orderItems).set({ status: "cancelled", updatedAt: now }).where(eq(orderItems.orderId, order.id)).run();
    ctx.freeTable(table.id);
    ctx.appendEvent("order.cancelled", "order", order.id, { orderId, reason, requestedBy, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds });

    return { orderId, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds };
  });

  const result = run();
  ctx.finalizeCompletedBusinessDays();
  return result;
}

export function cancelOrderItems(ctx: OrderLifecycleContext, orderId: string, input: CancelOrderItemsInput): OrderLifecycleResult {
  const run = ctx.db.transaction(() => {
    const requestedBy = input.requestedBy;
    ctx.verifyManagerApproval(input.managerApproval, "order_item.cancel", "order", orderId, requestedBy);
    const order = ctx.requireEditableOrder(orderId);
    if (order.id !== orderId) throw new DomainError("Order not found", 404);
    const table = ctx.requireTable(order.table_id);
    const now = new Date().toISOString();
    const changes: KotItemChange[] = [];

    for (const requested of input.items) {
      const item = ctx.getOrderItemById(requested.orderItemId);
      if (!item || item.order_id !== order.id || item.status === "cancelled" || item.quantity <= 0) {
        throw new DomainError("Cannot cancel an item that is not active on this order");
      }
      if (requested.quantity > item.quantity) throw new DomainError("Cannot cancel more items than the order has");
      const change = ctx.kotChangeFromOrderItem(item, -requested.quantity);
      if (change) changes.push(change);
      const remaining = item.quantity - requested.quantity;
      ctx.orm
        .update(orderItems)
        .set({ quantity: remaining, status: remaining === 0 ? "cancelled" : "active", updatedAt: now })
        .where(eq(orderItems.id, item.id))
        .run();
    }

    const remainingItems = ctx.getOrderItems(order.id).filter((item) => item.quantity > 0 && item.status !== "cancelled");
    if (remainingItems.length === 0) {
      ctx.orm.update(orders).set({ status: "cancelled", updatedAt: now }).where(eq(orders.id, order.id)).run();
      ctx.freeTable(table.id);
    } else {
      ctx.orm.update(orders).set({ updatedAt: now }).where(eq(orders.id, order.id)).run();
    }

    const tickets = ctx.createKotsForChanges(order, table, changes, now, false, false, input.managerApproval.reason);
    ctx.appendEvent("order_items.cancelled", "order", order.id, {
      orderId,
      reason: input.managerApproval.reason,
      requestedBy,
      items: input.items,
      kotIds: tickets.kotIds,
      printJobIds: tickets.printJobIds
    });
    return { orderId, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds };
  });

  const result = run();
  ctx.finalizeCompletedBusinessDays();
  return result;
}

function orderInputForActor(input: SubmitOrderInput, actor?: DeviceActor): CreateOrderInput {
  return {
    tableId: input.tableId,
    captainId: actor?.name || input.captainId || "captain",
    pax: input.pax,
    orderType: input.orderType
  };
}

function assertCanEditOrder(order: OrderRow, actor?: DeviceActor): void {
  if (!actor || ["admin", "captain", "waiter"].includes(actor.role)) return;
  throw new DomainError("Device role cannot edit orders", 403);
}
