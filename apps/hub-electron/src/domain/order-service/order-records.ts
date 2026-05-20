import type { SubmitOrderInput, UserRole } from "@gaurav-pos/shared";
import { eq } from "drizzle-orm";
import type { HubOrm } from "../../db/database.js";
import { orders, restaurantTables } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import type { DeviceActor, OrderRow } from "./types.js";

export function assertCanMoveOrder(order: OrderRow, actor: DeviceActor, action: "table" | "items"): void {
  if (actor.role === "admin") {
    if (action === "items" && order.status !== "open") throw new DomainError("Only running tables can have selected items shifted");
    if (action === "table" && !["open", "billed"].includes(order.status)) throw new DomainError("Only running or billed tables can be shifted");
    return;
  }
  if (actor.role !== "captain") throw new DomainError("Only captains can shift tables from the APK", 403);
  if (order.status !== "open") throw new DomainError("Captains can shift only running tables before billing", 403);
}

export function createOrder(
  orm: HubOrm,
  input: Pick<SubmitOrderInput, "tableId" | "pax" | "orderType"> & { captainId: string },
  posDayId: string,
  now: string,
  actor?: DeviceActor
): OrderRow {
  const orderId = makeId("order");
  orm
    .insert(orders)
    .values({
      id: orderId,
      tableId: input.tableId,
      posDayId,
      orderType: input.orderType,
      status: "open",
      pax: input.pax,
      captainId: input.captainId,
      captainDeviceId: actor && ["captain", "waiter"].includes(actor.role) ? actor.id : null,
      createdByDeviceId: actor?.id ?? null,
      createdByRole: actor?.role ?? null,
      createdAt: now,
      updatedAt: now
    })
    .run();

  return requireEditableOrder(orm, orderId);
}

export function freeTable(orm: HubOrm, tableId: string): void {
  orm
    .update(restaurantTables)
    .set({ status: "free", currentOrderId: null, occupiedAt: null })
    .where(eq(restaurantTables.id, tableId))
    .run();
}

export function selectOrderById(orm: HubOrm, orderId: string): OrderRow | undefined {
  const row = orm
    .select({
      id: orders.id,
      table_id: orders.tableId,
      pos_day_id: orders.posDayId,
      status: orders.status,
      captain_id: orders.captainId,
      captain_device_id: orders.captainDeviceId,
      created_by_device_id: orders.createdByDeviceId,
      created_by_role: orders.createdByRole,
      created_at: orders.createdAt,
      updated_at: orders.updatedAt
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .get();
  return row ? { ...row, created_by_role: row.created_by_role as UserRole | null } : undefined;
}

export function requireEditableOrder(orm: HubOrm, orderId: string): OrderRow {
  const order = selectOrderById(orm, orderId);
  if (!order) throw new DomainError("Order not found", 404);
  if (!["open"].includes(order.status)) throw new DomainError("Order is not editable");
  return order;
}

export function requireOrderById(orm: HubOrm, orderId: string): OrderRow {
  const order = selectOrderById(orm, orderId);
  if (!order) throw new DomainError("Order not found", 404);
  return order;
}
