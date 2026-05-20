import type { DomainEvent, MoveOrderItemsInput, MoveTableInput, SubmitOrderInput } from "@gaurav-pos/shared";
import { eq, sql } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { orderItems, orderMovements, orders, restaurantTables } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import { combineItemNotes } from "./helpers.js";
import type { DeviceActor, KotItemChange, OrderItemRow, OrderRow, TableRow, TicketCreationResult } from "./types.js";

type CreateOrderInput = Pick<SubmitOrderInput, "tableId" | "pax" | "orderType"> & { captainId: string };

type MoveTableResult = {
  fromTableId: string;
  toTableId: string;
  orderId: string;
  kotIds: string[];
  printJobIds: string[];
};

type MoveOrderItemsResult = {
  fromOrderId: string;
  toOrderId: string;
  movementId: string;
  sourceKotIds: string[];
  targetKotIds: string[];
  printJobIds: string[];
};

export type TableTransferContext = {
  orm: HubOrm;
  db: SqliteDatabase;
  requireTable: (tableId: string) => TableRow;
  requireOrderById: (orderId: string) => OrderRow;
  requireEditableOrder: (orderId: string) => OrderRow;
  assertCanMoveOrder: (order: OrderRow, actor: DeviceActor, action: "table" | "items") => void;
  createOrder: (input: CreateOrderInput, posDayId: string, now: string, actor?: DeviceActor) => OrderRow;
  getOrderItems: (orderId: string) => OrderItemRow[];
  getOrderItemById: (orderItemId: string) => OrderItemRow | undefined;
  kotChangeFromOrderItem: (item: OrderItemRow, quantityDelta: number) => KotItemChange | null;
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
  freeTable: (tableId: string) => void;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function moveTable(ctx: TableTransferContext, input: MoveTableInput, actor: DeviceActor): MoveTableResult {
  const targetPreview = ctx.requireTable(input.toTableId);
  if (targetPreview.current_order_id) {
    const fromTable = ctx.requireTable(input.fromTableId);
    if (!fromTable.current_order_id) throw new DomainError("Source table has no running order");
    const order = ctx.requireOrderById(fromTable.current_order_id);
    ctx.assertCanMoveOrder(order, actor, "items");
    const items = ctx.getOrderItems(order.id)
      .filter((item) => item.status !== "cancelled" && item.quantity > 0)
      .map((item) => ({ orderItemId: item.id, quantity: item.quantity }));
    if (!items.length) throw new DomainError("Source table has no movable items");
    const movement = moveOrderItemsWithContext(
      ctx,
      {
        fromTableId: input.fromTableId,
        toTableId: input.toTableId,
        reason: `Full table transfer: ${input.reason}`,
        items
      },
      actor
    );
    return {
      fromTableId: input.fromTableId,
      toTableId: input.toTableId,
      orderId: movement.toOrderId,
      kotIds: [...movement.sourceKotIds, ...movement.targetKotIds],
      printJobIds: movement.printJobIds
    };
  }

  const run = ctx.db.transaction(() => {
    const fromTable = ctx.requireTable(input.fromTableId);
    const toTable = ctx.requireTable(input.toTableId);
    if (!fromTable.current_order_id) throw new DomainError("Source table has no running order");
    if (toTable.current_order_id) throw new DomainError("Target table already has a running order");
    const order = ctx.requireOrderById(fromTable.current_order_id);
    ctx.assertCanMoveOrder(order, actor, "table");
    const now = new Date().toISOString();

    ctx.orm.update(orders).set({ tableId: toTable.id, updatedAt: now }).where(eq(orders.id, order.id)).run();
    ctx.freeTable(fromTable.id);
    ctx.orm
      .update(restaurantTables)
      .set({ status: order.status === "billed" ? "billed" : "occupied", currentOrderId: order.id, occupiedAt: fromTable.occupied_at ?? now })
      .where(eq(restaurantTables.id, toTable.id))
      .run();

    const tickets = ctx.createKotsForChanges(
      order,
      { ...toTable, current_order_id: order.id, status: order.status === "billed" ? "billed" : "occupied" },
      ctx.getOrderItems(order.id)
        .filter((item) => item.quantity > 0)
        .map((item) => ctx.kotChangeFromOrderItem(item, item.quantity))
        .filter((change): change is KotItemChange => Boolean(change)),
      now,
      false,
      false,
      `Table shifted from ${fromTable.name} to ${toTable.name}: ${input.reason}`,
      "table_shifted"
    );
    const movementId = makeId("move");
    ctx.orm
      .insert(orderMovements)
      .values({
        id: movementId,
        fromTableId: fromTable.id,
        toTableId: toTable.id,
        sourceOrderId: order.id,
        movedItemsJson: JSON.stringify({ type: "table" }),
        reason: input.reason,
        movedBy: actor.name,
        createdAt: now
      })
      .run();
    ctx.appendEvent("table.shifted", "order", order.id, {
      ...input,
      movedBy: actor.name,
      movedByDeviceId: actor.id,
      orderId: order.id,
      movementId,
      kotIds: tickets.kotIds,
      printJobIds: tickets.printJobIds
    });
    return { fromTableId: fromTable.id, toTableId: toTable.id, orderId: order.id, kotIds: tickets.kotIds, printJobIds: tickets.printJobIds };
  });
  return run();
}

export function moveOrderItems(ctx: TableTransferContext, input: MoveOrderItemsInput, actor: DeviceActor): MoveOrderItemsResult {
  return moveOrderItemsWithContext(ctx, input, actor);
}

function moveOrderItemsWithContext(ctx: TableTransferContext, input: MoveOrderItemsInput, actor: DeviceActor): MoveOrderItemsResult {
  const run = ctx.db.transaction(() => {
    const fromTable = ctx.requireTable(input.fromTableId);
    const toTable = ctx.requireTable(input.toTableId);
    if (!fromTable.current_order_id) throw new DomainError("Source table has no running order");
    const fromOrder = ctx.requireEditableOrder(fromTable.current_order_id);
    ctx.assertCanMoveOrder(fromOrder, actor, "items");
    const now = new Date().toISOString();
    const targetHadRunningOrder = Boolean(toTable.current_order_id);
    const toOrder = toTable.current_order_id
      ? ctx.requireEditableOrder(toTable.current_order_id)
      : ctx.createOrder({ tableId: toTable.id, captainId: actor.name, pax: 1, orderType: "dine_in" }, fromOrder.pos_day_id, now, actor);
    if (targetHadRunningOrder) ctx.assertCanMoveOrder(toOrder, actor, "items");

    const movementPayload: Array<{ orderItemId: string; quantity: number; name: string }> = [];
    const sourceChanges: KotItemChange[] = [];
    const targetChanges: KotItemChange[] = [];

    for (const moveItem of input.items) {
      const source = ctx.getOrderItemById(moveItem.orderItemId);
      if (!source || source.order_id !== fromOrder.id || source.quantity < moveItem.quantity) {
        throw new DomainError("Cannot shift more items than the source table has");
      }
      const target = getMatchingOrderItemSnapshot(ctx, toOrder.id, source);
      let targetOrderItemId = target?.id;
      if (target) {
        ctx.orm
          .update(orderItems)
          .set({ quantity: target.quantity + moveItem.quantity, note: combineItemNotes(target.note, source.note), status: "active", updatedAt: now })
          .where(eq(orderItems.id, target.id))
          .run();
      } else {
        targetOrderItemId = makeId("item");
        ctx.orm
          .insert(orderItems)
          .values({
            id: targetOrderItemId,
            orderId: toOrder.id,
            menuItemId: source.menu_item_id,
            menuItemVariantId: source.menu_item_variant_id,
            nameSnapshot: source.name_snapshot,
            variantNameSnapshot: source.variant_name_snapshot,
            variantVolumeMl: source.variant_volume_ml,
            inventoryActionSnapshot: source.inventory_action_snapshot,
            alcoholRecipeSnapshotJson: source.alcohol_recipe_snapshot_json,
            unitPricePaise: source.unit_price_paise,
            quantity: moveItem.quantity,
            productionUnitId: source.production_unit_id,
            saleGroupId: source.sale_group_id,
            saleGroupNameSnapshot: source.sale_group_name_snapshot,
            saleGroupKindSnapshot: source.sale_group_kind_snapshot,
            ticketLabelSnapshot: source.ticket_label_snapshot,
            taxComponentsJson: source.tax_components_json,
            taxPaise: source.tax_paise,
            note: source.note,
            isOpenItem: Boolean(source.is_open_item),
            status: "active",
            createdAt: now,
            updatedAt: now
          })
          .run();
      }

      const sourceChange = ctx.kotChangeFromOrderItem(source, -moveItem.quantity);
      if (sourceChange) sourceChanges.push(sourceChange);
      const targetChange = ctx.kotChangeFromOrderItem(source, moveItem.quantity);
      if (targetChange) targetChanges.push({ ...targetChange, orderItemId: targetOrderItemId ?? source.id });
      const remaining = source.quantity - moveItem.quantity;
      ctx.orm
        .update(orderItems)
        .set({ quantity: remaining, status: remaining === 0 ? "cancelled" : "active", updatedAt: now })
        .where(eq(orderItems.id, source.id))
        .run();
      movementPayload.push({ orderItemId: source.id, quantity: moveItem.quantity, name: source.name_snapshot });
    }

    const sourceWillBeEmpty = ctx.getOrderItems(fromOrder.id).every((item) => item.quantity === 0);
    if (sourceWillBeEmpty) {
      ctx.orm.update(orders).set({ status: "cancelled", updatedAt: now }).where(eq(orders.id, fromOrder.id)).run();
      ctx.freeTable(fromTable.id);
    }
    ctx.orm
      .update(restaurantTables)
      .set({
        status: "occupied",
        currentOrderId: toOrder.id,
        occupiedAt: targetHadRunningOrder ? sql`COALESCE(${restaurantTables.occupiedAt}, ${now})` : sourceWillBeEmpty ? (fromTable.occupied_at ?? now) : now
      })
      .where(eq(restaurantTables.id, toTable.id))
      .run();

    const sourceTickets = ctx.createKotsForChanges(
      fromOrder,
      fromTable,
      sourceChanges,
      now,
      false,
      false,
      `Items shifted to ${toTable.name}: ${input.reason}`,
      "table_shifted"
    );
    const targetTickets = ctx.createKotsForChanges(
      toOrder,
      { ...toTable, current_order_id: toOrder.id, status: "occupied" },
      targetChanges,
      now,
      false,
      false,
      `Items shifted from ${fromTable.name}: ${input.reason}`,
      "table_shifted",
      targetHadRunningOrder ? toOrder.id : fromOrder.id
    );

    const movementId = makeId("move");
    ctx.orm
      .insert(orderMovements)
      .values({
        id: movementId,
        fromTableId: fromTable.id,
        toTableId: toTable.id,
        sourceOrderId: fromOrder.id,
        targetOrderId: toOrder.id,
        movedItemsJson: JSON.stringify(movementPayload),
        reason: input.reason,
        movedBy: actor.name,
        createdAt: now
      })
      .run();
    ctx.appendEvent("order_items.shifted", "order", fromOrder.id, {
      ...input,
      movedBy: actor.name,
      movedByDeviceId: actor.id,
      toOrderId: toOrder.id,
      movementId,
      sourceKotIds: sourceTickets.kotIds,
      targetKotIds: targetTickets.kotIds,
      printJobIds: [...sourceTickets.printJobIds, ...targetTickets.printJobIds]
    });
    return {
      fromOrderId: fromOrder.id,
      toOrderId: toOrder.id,
      movementId,
      sourceKotIds: sourceTickets.kotIds,
      targetKotIds: targetTickets.kotIds,
      printJobIds: [...sourceTickets.printJobIds, ...targetTickets.printJobIds]
    };
  });
  return run();
}

function getMatchingOrderItemSnapshot(ctx: TableTransferContext, orderId: string, source: OrderItemRow): OrderItemRow | undefined {
  return ctx.getOrderItems(orderId).find(
    (item) => item.menu_item_id === source.menu_item_id && item.menu_item_variant_id === source.menu_item_variant_id && orderItemSnapshotsMatch(item, source)
  );
}

function orderItemSnapshotsMatch(left: OrderItemRow, right: OrderItemRow): boolean {
  return (
    left.name_snapshot === right.name_snapshot &&
    left.variant_name_snapshot === right.variant_name_snapshot &&
    left.variant_volume_ml === right.variant_volume_ml &&
    left.inventory_action_snapshot === right.inventory_action_snapshot &&
    left.alcohol_recipe_snapshot_json === right.alcohol_recipe_snapshot_json &&
    left.unit_price_paise === right.unit_price_paise &&
    left.production_unit_id === right.production_unit_id &&
    left.sale_group_id === right.sale_group_id &&
    left.sale_group_name_snapshot === right.sale_group_name_snapshot &&
    left.sale_group_kind_snapshot === right.sale_group_kind_snapshot &&
    left.ticket_label_snapshot === right.ticket_label_snapshot &&
    left.tax_components_json === right.tax_components_json &&
    Boolean(left.is_open_item) === Boolean(right.is_open_item)
  );
}
