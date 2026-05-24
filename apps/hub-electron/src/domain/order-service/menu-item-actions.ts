import type { CreateMenuItemInput, DomainEvent, UpdateMenuItemInput } from "@gaurav-pos/shared";
import { count, eq } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import {
  alcoholProfiles,
  alcoholRecipeIngredients,
  alcoholStockLevels,
  alcoholStockMovements,
  menuItems,
  menuItemVariants,
  orderItems
} from "../../db/drizzle-schema.js";
import { queueCloudBackupTombstone, queueCloudBackupTombstones } from "../../sync/backup-tombstones.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import { ensureDefaultMenuItemVariant, updateDefaultMenuItemVariant } from "./menu-catalog.js";
import { requireProductionUnit } from "./production-unit-queries.js";
import { requireSaleGroup } from "./sale-group-catalog.js";
import { csvBoolean, csvMoneyToPaise, csvText, parseCsvRows, requireCsvText } from "./csv-import.js";
import type { BulkMenuDeleteInput, BulkMenuDeleteKind, BulkMenuDeleteResult, CsvImportResult } from "./types.js";

type RemoveMenuItemResult = { id: string; deleted: boolean; active: boolean };

export type MenuItemActionContext = {
  orm: HubOrm;
  db: SqliteDatabase;
  resolveProductionUnitRef: (value: string | null) => string | null;
  resolveSaleGroupRef: (value: string) => string;
  countAlcoholRecipeSnapshotUsage: (menuItemId: string) => number;
  isAlcoholMenuItem: (id: string) => boolean;
  verifyManagerApproval: (input: BulkMenuDeleteInput["managerApproval"], action: string, aggregateType: string, aggregateId: string, requestedBy?: string) => void;
  verifyMasterApproval: (input: BulkMenuDeleteInput["masterApproval"], action: string, aggregateType: string, aggregateId: string, requestedBy?: string) => void;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function createMenuItem(ctx: MenuItemActionContext, input: CreateMenuItemInput): { id: string } {
  if (input.productionUnitId) requireProductionUnit(ctx.orm, input.productionUnitId);
  requireSaleGroup(ctx.db, input.saleGroupId ?? "sg-food");
  const id = createEntityId("menu", input.customId, (candidate) =>
    Boolean(ctx.orm.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.id, candidate)).get())
  );
  ctx.orm
    .insert(menuItems)
    .values({
      id,
      name: input.name,
      pricePaise: input.pricePaise,
      productionUnitId: input.productionUnitId ?? null,
      saleGroupId: input.saleGroupId ?? "sg-food",
      active: input.active ?? true
    })
    .run();
  ensureDefaultMenuItemVariant(ctx.orm, id, input.pricePaise, input.active ?? true);
  ctx.appendEvent("menu_item.created", "menu_item", id, { ...input, id });
  return { id };
}

export function importMenuItemsFromCsv(ctx: MenuItemActionContext, csv: string): CsvImportResult {
  const run = ctx.db.transaction(() => {
    const rows = parseCsvRows(csv);
    const result: CsvImportResult = { created: 0, failed: 0, ids: [], errors: [] };
    for (const row of rows) {
      try {
        const name = requireCsvText(row, ["name", "item_name", "dish_name"]);
        if (findMenuItemIdByName(ctx, name)) throw new DomainError(`Menu item "${name}" already exists`);
        const pricePaise = csvMoneyToPaise(requireCsvText(row, ["price", "price_rupees", "rate"]));
        const productionUnitId = ctx.resolveProductionUnitRef(csvText(row, ["kitchen_or_counter", "kitchen", "counter", "production_unit"]));
        const saleGroupId = ctx.resolveSaleGroupRef(csvText(row, ["sale_category", "sale_group", "category"]) || "Food");
        const created = createMenuItem(ctx, {
          name,
          pricePaise,
          productionUnitId,
          saleGroupId,
          active: csvBoolean(csvText(row, ["active"]), true)
        });
        result.created += 1;
        result.ids.push(created.id);
      } catch (error) {
        result.failed += 1;
        result.errors.push({ row: row.rowNumber, message: error instanceof Error ? error.message : "Could not import row" });
      }
    }
    return result;
  });
  return run();
}

export function updateMenuItem(ctx: MenuItemActionContext, id: string, input: UpdateMenuItemInput): { id: string } {
  if (input.productionUnitId) requireProductionUnit(ctx.orm, input.productionUnitId);
  if (input.saleGroupId) requireSaleGroup(ctx.db, input.saleGroupId);
  const existing = ctx.orm
    .select({
      name: menuItems.name,
      pricePaise: menuItems.pricePaise,
      productionUnitId: menuItems.productionUnitId,
      saleGroupId: menuItems.saleGroupId,
      active: menuItems.active
    })
    .from(menuItems)
    .where(eq(menuItems.id, id))
    .get();
  if (!existing) throw new DomainError("Menu item not found", 404);

  ctx.orm
    .update(menuItems)
    .set({
      name: input.name ?? existing.name,
      pricePaise: input.pricePaise ?? existing.pricePaise,
      productionUnitId: input.productionUnitId !== undefined ? input.productionUnitId : existing.productionUnitId,
      saleGroupId: input.saleGroupId ?? existing.saleGroupId,
      active: input.active ?? existing.active
    })
    .where(eq(menuItems.id, id))
    .run();
  if (input.pricePaise !== undefined || input.active !== undefined) {
    updateDefaultMenuItemVariant(ctx.orm, id, { pricePaise: input.pricePaise, active: input.active });
  }

  ctx.appendEvent("menu_item.updated", "menu_item", id, { id, ...input });
  return { id };
}

export function setMenuItemActive(ctx: MenuItemActionContext, id: string, active: boolean): { id: string; active: boolean } {
  const result = ctx.orm.update(menuItems).set({ active }).where(eq(menuItems.id, id)).run();
  if (result.changes === 0) throw new DomainError("Menu item not found", 404);
  updateDefaultMenuItemVariant(ctx.orm, id, { active });
  ctx.appendEvent("menu_item.active_changed", "menu_item", id, { id, active });
  return { id, active };
}

export function removeMenuItem(ctx: MenuItemActionContext, id: string): RemoveMenuItemResult {
  const usage = ctx.orm.select({ count: count() }).from(orderItems).where(eq(orderItems.menuItemId, id)).get()?.count ?? 0;
  const stockMovementUsage = ctx.orm.select({ count: count() }).from(alcoholStockMovements).where(eq(alcoholStockMovements.menuItemId, id)).get()?.count ?? 0;
  const stockLevelUsage = ctx.db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM alcohol_stock_levels
       WHERE menu_item_id = ?
         AND (sealed_large_count != 0 OR open_large_ml != 0 OR sealed_small_count != 0)`
    )
    .get(id) as { count?: number } | undefined;
  const recipeUsage = ctx.orm.select({ count: count() }).from(alcoholRecipeIngredients).where(eq(alcoholRecipeIngredients.liquorMenuItemId, id)).get()?.count ?? 0;
  const recipeSnapshotUsage = ctx.countAlcoholRecipeSnapshotUsage(id);
  if (usage > 0 || stockMovementUsage > 0 || (stockLevelUsage?.count ?? 0) > 0 || recipeUsage > 0 || recipeSnapshotUsage > 0) {
    setMenuItemActive(ctx, id, false);
    return { id, deleted: false, active: false };
  }
  const deletedAt = new Date().toISOString();
  const recipeIds = ctx.db
    .prepare("SELECT id FROM alcohol_recipe_ingredients WHERE product_menu_item_id = ? OR liquor_menu_item_id = ?")
    .all(id, id) as Array<{ id: string }>;
  const variantIds = ctx.db.prepare("SELECT id FROM menu_item_variants WHERE menu_item_id = ?").all(id) as Array<{ id: string }>;
  queueCloudBackupTombstones(ctx.db, "alcohol_recipe_ingredients", recipeIds.map((row) => row.id), deletedAt);
  queueCloudBackupTombstone(ctx.db, { domain: "alcohol_stock_levels", localId: id, deletedAt });
  queueCloudBackupTombstone(ctx.db, { domain: "alcohol_profiles", localId: id, deletedAt });
  queueCloudBackupTombstones(ctx.db, "menu_item_variants", variantIds.map((row) => row.id), deletedAt);
  queueCloudBackupTombstone(ctx.db, { domain: "menu_items", localId: id, deletedAt });
  ctx.orm.delete(alcoholRecipeIngredients).where(eq(alcoholRecipeIngredients.productMenuItemId, id)).run();
  ctx.orm.delete(alcoholRecipeIngredients).where(eq(alcoholRecipeIngredients.liquorMenuItemId, id)).run();
  ctx.orm.delete(alcoholStockLevels).where(eq(alcoholStockLevels.menuItemId, id)).run();
  ctx.orm.delete(alcoholProfiles).where(eq(alcoholProfiles.menuItemId, id)).run();
  ctx.orm.delete(menuItemVariants).where(eq(menuItemVariants.menuItemId, id)).run();
  const result = ctx.orm.delete(menuItems).where(eq(menuItems.id, id)).run();
  if (result.changes === 0) throw new DomainError("Dish not found", 404);
  ctx.appendEvent("menu_item.deleted", "menu_item", id, { id });
  return { id, deleted: true, active: false };
}

export function removeMenuItemWithApproval(ctx: MenuItemActionContext, id: string, input: BulkMenuDeleteInput): RemoveMenuItemResult {
  if (ctx.isAlcoholMenuItem(id)) {
    ctx.verifyMasterApproval(input.masterApproval, "menu_item.delete_alcohol", "menu_item", id, input.masterApproval?.approvedBy ?? "owner");
  } else {
    ctx.verifyManagerApproval(input.managerApproval, "menu_item.delete_dish", "menu_item", id, input.managerApproval?.approvedBy ?? "manager");
  }
  return removeMenuItem(ctx, id);
}

export function bulkRemoveMenuItems(ctx: MenuItemActionContext, kind: BulkMenuDeleteKind, input: BulkMenuDeleteInput): BulkMenuDeleteResult {
  if (kind === "alcohol") {
    ctx.verifyMasterApproval(input.masterApproval, "menu_item.bulk_delete_alcohol", "menu_item", "alcohol", input.masterApproval?.approvedBy ?? "owner");
  } else {
    ctx.verifyManagerApproval(input.managerApproval, "menu_item.bulk_delete_dishes", "menu_item", "dish", input.managerApproval?.approvedBy ?? "manager");
  }
  const rows = ctx.db
    .prepare(
      kind === "alcohol"
        ? `SELECT mi.id, mi.name
           FROM menu_items mi
           JOIN alcohol_profiles ap ON ap.menu_item_id = mi.id
           ORDER BY mi.name`
        : `SELECT mi.id, mi.name
           FROM menu_items mi
           JOIN sale_groups sg ON sg.id = mi.sale_group_id
           WHERE sg.kind != 'alcohol'
           ORDER BY mi.name`
    )
    .all() as Array<{ id: string; name: string }>;
  const result: BulkMenuDeleteResult = { deleted: 0, disabled: 0, failed: 0, errors: [] };
  for (const row of rows) {
    try {
      const removed = removeMenuItem(ctx, row.id);
      if (removed.deleted) result.deleted += 1;
      else result.disabled += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({ id: row.id, name: row.name, message: error instanceof Error ? error.message : "Could not remove item" });
    }
  }
  ctx.appendEvent(kind === "alcohol" ? "menu_items.alcohol_bulk_removed" : "menu_items.dish_bulk_removed", "menu_item", kind, result);
  return result;
}

function findMenuItemIdByName(ctx: MenuItemActionContext, name: string): string | null {
  const row = ctx.orm.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.name, name)).get();
  return row?.id ?? null;
}

function createEntityId(prefix: string, customId: string | undefined, exists: (id: string) => boolean): string {
  const requestedId = customId?.trim();
  if (requestedId) {
    if (exists(requestedId)) throw new DomainError("That custom ID is already used. Choose another one.", 409);
    return requestedId;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const generatedId = makeId(prefix);
    if (!exists(generatedId)) return generatedId;
  }
  throw new DomainError("Could not create a unique ID. Please try again.", 500);
}
