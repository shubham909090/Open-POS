import type {
  CreateFloorInput,
  CreateProductionUnitInput,
  CreateSaleGroupInput,
  CreateTableInput,
  DomainEvent,
  UpdateFloorInput,
  UpdateProductionUnitInput,
  UpdateSaleGroupInput,
  UpdateTableInput
} from "@gaurav-pos/shared";
import { count, eq } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { floors, kots, menuItems, orderItems, orders, productionUnits, restaurantTables, saleGroups } from "../../db/drizzle-schema.js";
import { queueCloudBackupTombstone } from "../../sync/backup-tombstones.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import { nextFloorSortOrder, nextTableSortOrder, requireFloor, requireTable } from "./floor-table-catalog.js";
import { requireProductionUnit } from "./production-unit-queries.js";

type RemoveResult = { id: string; deleted: boolean; active: boolean };

export type SetupCatalogActionContext = {
  orm: HubOrm;
  db: SqliteDatabase;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function createSaleGroup(ctx: SetupCatalogActionContext, input: CreateSaleGroupInput): { id: string } {
  if (input.defaultProductionUnitId) requireProductionUnit(ctx.orm, input.defaultProductionUnitId);
  const id = createEntityId("sg", input.customId, (candidate) =>
    Boolean(ctx.orm.select({ id: saleGroups.id }).from(saleGroups).where(eq(saleGroups.id, candidate)).get())
  );
  ctx.orm
    .insert(saleGroups)
    .values({
      id,
      name: input.name,
      kind: input.kind,
      reportLabel: input.reportLabel ?? input.name,
      ticketLabel: input.ticketLabel ?? "KOT",
      taxComponentsJson: JSON.stringify(input.taxComponents ?? []),
      defaultProductionUnitId: input.defaultProductionUnitId ?? null,
      active: input.active ?? true
    })
    .run();
  ctx.appendEvent("sale_group.created", "sale_group", id, { ...input, id });
  return { id };
}

export function updateSaleGroup(ctx: SetupCatalogActionContext, id: string, input: UpdateSaleGroupInput): { id: string } {
  if (input.defaultProductionUnitId) requireProductionUnit(ctx.orm, input.defaultProductionUnitId);
  const result = ctx.orm
    .update(saleGroups)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.reportLabel !== undefined ? { reportLabel: input.reportLabel } : {}),
      ...(input.ticketLabel !== undefined ? { ticketLabel: input.ticketLabel } : {}),
      ...(input.taxComponents !== undefined ? { taxComponentsJson: JSON.stringify(input.taxComponents) } : {}),
      ...(input.defaultProductionUnitId !== undefined ? { defaultProductionUnitId: input.defaultProductionUnitId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    })
    .where(eq(saleGroups.id, id))
    .run();
  if (result.changes === 0) throw new DomainError("Sale group not found", 404);
  ctx.appendEvent("sale_group.updated", "sale_group", id, { id, ...input });
  return { id };
}

export function createFloor(ctx: SetupCatalogActionContext, input: CreateFloorInput): { id: string } {
  const id = createEntityId("floor", input.customId, (candidate) =>
    Boolean(ctx.orm.select({ id: floors.id }).from(floors).where(eq(floors.id, candidate)).get())
  );
  const sortOrder = input.sortOrder ?? nextFloorSortOrder(ctx.db);
  ctx.orm.insert(floors).values({ id, name: input.name, active: input.active ?? true, sortOrder }).run();
  ctx.appendEvent("floor.created", "floor", id, { ...input, id });
  return { id };
}

export function updateFloor(ctx: SetupCatalogActionContext, id: string, input: UpdateFloorInput): { id: string } {
  const result = ctx.orm
    .update(floors)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
    })
    .where(eq(floors.id, id))
    .run();
  if (result.changes === 0) throw new DomainError("Floor not found", 404);
  ctx.appendEvent("floor.updated", "floor", id, { id, ...input });
  return { id };
}

export function removeFloor(ctx: SetupCatalogActionContext, id: string): RemoveResult {
  const usage = ctx.orm.select({ count: count() }).from(restaurantTables).where(eq(restaurantTables.floorId, id)).get()?.count ?? 0;
  if (usage > 0) {
    updateFloor(ctx, id, { active: false });
    return { id, deleted: false, active: false };
  }
  queueCloudBackupTombstone(ctx.db, { domain: "floors", localId: id, deletedAt: new Date().toISOString() });
  const result = ctx.orm.delete(floors).where(eq(floors.id, id)).run();
  if (result.changes === 0) throw new DomainError("Floor not found", 404);
  ctx.appendEvent("floor.deleted", "floor", id, { id });
  return { id, deleted: true, active: false };
}

export function createTable(ctx: SetupCatalogActionContext, input: CreateTableInput): { id: string } {
  requireFloor(ctx.orm, input.floorId);
  const id = createEntityId("table", input.customId, (candidate) =>
    Boolean(ctx.orm.select({ id: restaurantTables.id }).from(restaurantTables).where(eq(restaurantTables.id, candidate)).get())
  );
  const sortOrder = input.sortOrder ?? nextTableSortOrder(ctx.db, input.floorId);
  ctx.orm
    .insert(restaurantTables)
    .values({
      id,
      floorId: input.floorId,
      name: input.name,
      active: input.active ?? true,
      sortOrder,
      status: "free",
      currentOrderId: null,
      occupiedAt: null
    })
    .run();
  ctx.appendEvent("table.created", "table", id, { ...input, id });
  return { id };
}

export function updateTable(ctx: SetupCatalogActionContext, id: string, input: UpdateTableInput): { id: string } {
  if (input.floorId) requireFloor(ctx.orm, input.floorId);
  const currentTable = input.floorId && input.sortOrder === undefined
    ? ctx.orm.select({ floorId: restaurantTables.floorId }).from(restaurantTables).where(eq(restaurantTables.id, id)).get()
    : undefined;
  const sortOrder = input.sortOrder ?? (input.floorId && currentTable?.floorId !== input.floorId ? nextTableSortOrder(ctx.db, input.floorId) : undefined);
  const result = ctx.orm
    .update(restaurantTables)
    .set({
      ...(input.floorId !== undefined ? { floorId: input.floorId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {})
    })
    .where(eq(restaurantTables.id, id))
    .run();
  if (result.changes === 0) throw new DomainError("Table not found", 404);
  ctx.appendEvent("table.updated", "table", id, { id, ...input });
  return { id };
}

export function removeTable(ctx: SetupCatalogActionContext, id: string): RemoveResult {
  const table = requireTable(ctx.orm, id);
  if (table.current_order_id) throw new DomainError("Settle or cancel the active order before removing this table");
  const usage = ctx.orm.select({ count: count() }).from(orders).where(eq(orders.tableId, id)).get()?.count ?? 0;
  if (usage > 0) {
    updateTable(ctx, id, { active: false });
    return { id, deleted: false, active: false };
  }
  queueCloudBackupTombstone(ctx.db, { domain: "restaurant_tables", localId: id, deletedAt: new Date().toISOString() });
  const result = ctx.orm.delete(restaurantTables).where(eq(restaurantTables.id, id)).run();
  if (result.changes === 0) throw new DomainError("Table not found", 404);
  ctx.appendEvent("table.deleted", "table", id, { id });
  return { id, deleted: true, active: false };
}

export function createProductionUnit(ctx: SetupCatalogActionContext, input: CreateProductionUnitInput): { id: string } {
  const id = createEntityId("unit", input.customId, (candidate) =>
    Boolean(ctx.orm.select({ id: productionUnits.id }).from(productionUnits).where(eq(productionUnits.id, candidate)).get())
  );
  const printerMode = input.printerMode ?? "system";
  ctx.orm
    .insert(productionUnits)
    .values({
      id,
      name: input.name,
      printerMode,
      printerName: input.printerName ?? null,
      printerHost: input.printerHost ?? "",
      printerPort: input.printerPort ?? 9100,
      kdsEnabled: input.kdsEnabled ?? true,
      active: input.active ?? true
    })
    .run();
  ctx.appendEvent("production_unit.created", "production_unit", id, { ...input, id });
  return { id };
}

export function updateProductionUnit(ctx: SetupCatalogActionContext, id: string, input: UpdateProductionUnitInput): { id: string } {
  const result = ctx.orm
    .update(productionUnits)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.printerMode !== undefined ? { printerMode: input.printerMode } : {}),
      ...(input.printerName !== undefined ? { printerName: input.printerName } : {}),
      ...(input.printerHost !== undefined ? { printerHost: input.printerHost } : {}),
      ...(input.printerPort !== undefined ? { printerPort: input.printerPort } : {}),
      ...(input.kdsEnabled !== undefined ? { kdsEnabled: input.kdsEnabled } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    })
    .where(eq(productionUnits.id, id))
    .run();
  if (result.changes === 0) throw new DomainError("Kitchen / counter not found", 404);
  ctx.appendEvent("production_unit.updated", "production_unit", id, { id, ...input });
  return { id };
}

export function removeProductionUnit(ctx: SetupCatalogActionContext, id: string): RemoveResult {
  const menuUsage = ctx.orm.select({ count: count() }).from(menuItems).where(eq(menuItems.productionUnitId, id)).get()?.count ?? 0;
  const orderUsage = ctx.orm.select({ count: count() }).from(orderItems).where(eq(orderItems.productionUnitId, id)).get()?.count ?? 0;
  const kotUsage = ctx.orm.select({ count: count() }).from(kots).where(eq(kots.productionUnitId, id)).get()?.count ?? 0;
  if (menuUsage + orderUsage + kotUsage > 0) {
    updateProductionUnit(ctx, id, { active: false });
    return { id, deleted: false, active: false };
  }
  queueCloudBackupTombstone(ctx.db, { domain: "production_units", localId: id, deletedAt: new Date().toISOString() });
  const result = ctx.orm.delete(productionUnits).where(eq(productionUnits.id, id)).run();
  if (result.changes === 0) throw new DomainError("Kitchen / counter not found", 404);
  ctx.appendEvent("production_unit.deleted", "production_unit", id, { id });
  return { id, deleted: true, active: false };
}

function createEntityId(prefix: string, customId: string | undefined, exists: (id: string) => boolean): string {
  const requestedId = customId?.trim();
  if (requestedId) {
    if (exists(requestedId)) throw new DomainError("That custom ID is already used. Choose another one.", 409);
    return requestedId;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = makeId(prefix);
    if (!exists(id)) return id;
  }
  throw new DomainError("Could not create a unique ID. Please try again.", 500);
}
