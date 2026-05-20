import { and, eq } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { menuItems, menuItemVariants } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import type { MenuItemRow, MenuItemVariantRow } from "./types.js";

export function listMenuItemReadModels(db: SqliteDatabase, includeInactive = false): unknown[] {
  const where = includeInactive ? "" : "WHERE mi.active = 1";
  const rows = db
    .prepare(
      `SELECT mi.id, mi.name, mi.price_paise, mi.production_unit_id, mi.sale_group_id, mi.active,
        pu.name AS production_unit_name,
        sg.name AS sale_group_name,
        sg.kind AS sale_group_kind,
        sg.ticket_label
       FROM menu_items mi
       JOIN sale_groups sg ON sg.id = mi.sale_group_id
       LEFT JOIN production_units pu ON pu.id = mi.production_unit_id
       ${where}
       ORDER BY mi.active DESC, sg.name, mi.name`
    )
    .all();
  const variants = listVariantsForMenuItems(db, (rows as Array<{ id: string }>).map((row) => row.id), includeInactive);
  return (rows as Array<Record<string, unknown>>).map((row) => ({ ...row, variants: variants.get(String(row.id)) ?? [] }));
}

export function getCurrentMenuPopularity(db: SqliteDatabase, businessDayId: string): Array<{ menuItemId: string; quantity: number }> {
  return db
    .prepare(
      `SELECT oi.menu_item_id AS menuItemId, COALESCE(SUM(oi.quantity), 0) AS quantity
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.pos_day_id = ?
         AND oi.status != 'cancelled'
         AND oi.menu_item_id IS NOT NULL
       GROUP BY oi.menu_item_id
       HAVING quantity > 0
       ORDER BY quantity DESC, oi.menu_item_id ASC`
    )
    .all(businessDayId) as Array<{ menuItemId: string; quantity: number }>;
}

export function findMenuItemIdByName(db: SqliteDatabase, name: string): string | null {
  const row = db
    .prepare("SELECT id FROM menu_items WHERE lower(name) = lower(?) LIMIT 1")
    .get(name.trim()) as { id: string } | undefined;
  return row?.id ?? null;
}

export function listVariantsForMenuItems(db: SqliteDatabase, menuItemIds: string[], includeInactive = false): Map<string, MenuItemVariantRow[]> {
  const uniqueIds = [...new Set(menuItemIds)];
  if (uniqueIds.length === 0) return new Map();
  const placeholders = uniqueIds.map(() => "?").join(",");
  const activeClause = includeInactive ? "" : "AND active = 1";
  const rows = db
    .prepare(
      `SELECT id, menu_item_id, label, kind, price_paise, volume_ml, inventory_action, sort_order, active
       FROM menu_item_variants
       WHERE menu_item_id IN (${placeholders}) ${activeClause}
       ORDER BY menu_item_id, sort_order, id`
    )
    .all(...uniqueIds) as MenuItemVariantRow[];
  const variants = new Map<string, MenuItemVariantRow[]>();
  for (const row of rows) {
    variants.set(row.menu_item_id, [...(variants.get(row.menu_item_id) ?? []), row]);
  }
  return variants;
}

export function getMenuItemsByIds(db: SqliteDatabase, ids: string[]): Map<string, MenuItemRow> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();

  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT mi.id, mi.name, mi.price_paise,
        COALESCE(mi.production_unit_id, sg.default_production_unit_id) AS production_unit_id,
        sg.id AS sale_group_id,
        sg.name AS sale_group_name,
        sg.kind AS sale_group_kind,
        sg.ticket_label,
        sg.tax_components_json,
        pu.name AS unit_name,
        pu.printer_host,
        pu.printer_port,
        pu.printer_name
       FROM menu_items mi
       JOIN sale_groups sg ON sg.id = mi.sale_group_id
       LEFT JOIN production_units pu ON pu.id = COALESCE(mi.production_unit_id, sg.default_production_unit_id)
       WHERE mi.id IN (${placeholders})`
    )
    .all(...uniqueIds) as MenuItemRow[];

  return new Map(rows.map((row) => [row.id, row]));
}

export function resolveMenuItemVariant(
  db: SqliteDatabase,
  orm: HubOrm,
  menuItemId: string,
  variantId?: string,
  allowInactive = false
): MenuItemVariantRow {
  const params = variantId ? [variantId, menuItemId] : [menuItemId];
  const where = variantId ? "id = ? AND menu_item_id = ?" : "menu_item_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC LIMIT 1";
  let variant = db
    .prepare(
      `SELECT id, menu_item_id, label, kind, price_paise, volume_ml, inventory_action, sort_order, active
       FROM menu_item_variants
       WHERE ${where}`
    )
    .get(...params) as MenuItemVariantRow | undefined;

  if (!variant) {
    const item = orm.select({ id: menuItems.id, pricePaise: menuItems.pricePaise, active: menuItems.active }).from(menuItems).where(eq(menuItems.id, menuItemId)).get();
    if (!item) throw new DomainError("Menu item not found", 404);
    ensureDefaultMenuItemVariant(orm, menuItemId, item.pricePaise, Boolean(item.active));
    variant = db
      .prepare(
        `SELECT id, menu_item_id, label, kind, price_paise, volume_ml, inventory_action, sort_order, active
         FROM menu_item_variants
         WHERE menu_item_id = ? AND active = 1
         ORDER BY sort_order ASC, id ASC LIMIT 1`
      )
      .get(menuItemId) as MenuItemVariantRow | undefined;
  }

  if (!variant || (!variant.active && !allowInactive)) throw new DomainError("Menu item variation is not available", 404);
  return variant;
}

export function ensureDefaultMenuItemVariant(orm: HubOrm, menuItemId: string, pricePaise: number, active = true): void {
  orm
    .insert(menuItemVariants)
    .values({
      id: `${menuItemId}-default`,
      menuItemId,
      label: "Regular",
      kind: "default",
      pricePaise,
      volumeMl: null,
      inventoryAction: "none",
      sortOrder: 0,
      active
    })
    .onConflictDoNothing()
    .run();
}

export function updateDefaultMenuItemVariant(orm: HubOrm, menuItemId: string, input: { pricePaise?: number; active?: boolean }): void {
  orm
    .update(menuItemVariants)
    .set({
      ...(input.pricePaise !== undefined ? { pricePaise: input.pricePaise } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    })
    .where(and(eq(menuItemVariants.menuItemId, menuItemId), eq(menuItemVariants.kind, "default")))
    .run();
}
