import type { CreateAlcoholItemInput } from "@gaurav-pos/shared";
import { and, count, eq } from "drizzle-orm";
import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { alcoholProfiles, alcoholRecipeIngredients, alcoholStockLevels, menuItems, menuItemVariants, orderItems } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import { parseAlcoholRecipeSnapshot } from "./alcohol-usage.js";
import { csvInteger } from "./csv-import.js";
import { requireSaleGroup } from "./sale-group-catalog.js";
import type { MenuItemVariantRow } from "./types.js";

export function isAlcoholMenuItem(orm: HubOrm, id: string): boolean {
  return Boolean(orm.select({ menuItemId: alcoholProfiles.menuItemId }).from(alcoholProfiles).where(eq(alcoholProfiles.menuItemId, id)).get());
}

export function listAlcoholCatalogReadModel(
  db: SqliteDatabase,
  listVariantsForMenuItems: (menuItemIds: string[], includeInactive: boolean) => Map<string, MenuItemVariantRow[]>,
  storage: unknown[]
): unknown {
  const items = db
    .prepare(
      `SELECT mi.id, mi.name, mi.price_paise, mi.production_unit_id, pu.name AS production_unit_name,
        mi.active, ap.type, ap.large_bottle_ml, ap.small_bottle_ml,
        COALESCE(asl.sealed_large_count, 0) AS sealed_large_count,
        COALESCE(asl.open_large_ml, 0) AS open_large_ml,
        COALESCE(asl.sealed_small_count, 0) AS sealed_small_count
       FROM alcohol_profiles ap
       JOIN menu_items mi ON mi.id = ap.menu_item_id
       LEFT JOIN production_units pu ON pu.id = mi.production_unit_id
       LEFT JOIN alcohol_stock_levels asl ON asl.menu_item_id = mi.id
       ORDER BY mi.active DESC, mi.name`
    )
    .all() as Array<Record<string, unknown> & { id: string }>;
  const variants = listVariantsForMenuItems(items.map((item) => item.id), true);
  const recipes = listAlcoholRecipes(db);
  return {
    items: items.map((item) => ({
      ...item,
      variants: variants.get(item.id) ?? [],
      recipeIngredients: recipes.get(item.id) ?? []
    })),
    storage
  };
}

export function snapshotAlcoholRecipe(db: SqliteDatabase, menuItemId: string): string {
  const recipeRows = db
    .prepare("SELECT liquor_menu_item_id, ml_per_unit FROM alcohol_recipe_ingredients WHERE product_menu_item_id = ? ORDER BY id")
    .all(menuItemId) as Array<{ liquor_menu_item_id: string; ml_per_unit: number }>;
  return JSON.stringify(recipeRows.map((row) => ({ liquorMenuItemId: row.liquor_menu_item_id, mlPerUnit: row.ml_per_unit })));
}

export function countAlcoholRecipeSnapshotUsage(db: SqliteDatabase, menuItemId: string): number {
  const rows = db
    .prepare("SELECT alcohol_recipe_snapshot_json FROM order_items WHERE alcohol_recipe_snapshot_json LIKE ?")
    .all(`%${menuItemId}%`) as Array<{ alcohol_recipe_snapshot_json: string }>;
  return rows.filter((row) => parseAlcoholRecipeSnapshot(row.alcohol_recipe_snapshot_json).some((entry) => entry.liquorMenuItemId === menuItemId)).length;
}

export function resolvePlainLiquorRef(db: SqliteDatabase, value: string): string {
  const ref = value.trim();
  const row = db
    .prepare(
      `SELECT mi.id
       FROM menu_items mi
       JOIN alcohol_profiles ap ON ap.menu_item_id = mi.id
       WHERE ap.type = 'plain_liquor'
         AND mi.active = 1
         AND (lower(mi.id) = lower(?) OR lower(mi.name) = lower(?))
       LIMIT 1`
    )
    .get(ref, ref) as { id: string } | undefined;
  if (!row) throw new DomainError(`Plain liquor "${ref}" not found`);
  return row.id;
}

export function parseAlcoholRecipeCsv(db: SqliteDatabase, value: string | null): Array<{ liquorMenuItemId: string; mlPerUnit: number }> {
  if (!value?.trim()) return [];
  return value
    .split(/[;|]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, ml] = entry.split(":").map((part) => part.trim());
      if (!name || !ml) throw new DomainError(`Recipe entry "${entry}" must look like Whisky:60`);
      return { liquorMenuItemId: resolvePlainLiquorRef(db, name), mlPerUnit: csvInteger(ml, 0) };
    });
}

export function defaultAlcoholProductionUnitId(db: SqliteDatabase): string | null {
  const group = requireSaleGroup(db, "sg-alcohol");
  if (group.default_production_unit_id) return group.default_production_unit_id;
  const bar = db
    .prepare("SELECT id FROM production_units WHERE active = 1 AND lower(name) LIKE '%bar%' ORDER BY name LIMIT 1")
    .get() as { id: string } | undefined;
  return bar?.id ?? null;
}

export function assertAlcoholRecipeMatchesType(type: "plain_liquor" | "prepared_product", ingredients: CreateAlcoholItemInput["recipeIngredients"]): void {
  if (type === "plain_liquor" && (ingredients?.length ?? 0) > 0) {
    throw new DomainError("Plain liquor cannot have a cocktail recipe");
  }
}

export function assertAlcoholVariantsMatchType(type: "plain_liquor" | "prepared_product", variants: CreateAlcoholItemInput["variants"]): void {
  if (type !== "prepared_product") return;
  const variant = variants[0];
  if (
    variants.length !== 1 ||
    !variant ||
    variant.kind !== "default" ||
    variant.inventoryAction !== "none" ||
    (variant.volumeMl ?? null) !== null
  ) {
    throw new DomainError("Prepared alcohol products use one regular non-stock variation");
  }
}

export function assertAlcoholHasSellableVariant(orm: HubOrm, active: boolean, variants?: CreateAlcoholItemInput["variants"], menuItemId?: string): void {
  if (!active) return;
  if (variants) {
    if (!variants.some((variant) => variant.active !== false)) throw new DomainError("Active alcohol items need at least one active variation");
    return;
  }
  if (!menuItemId) throw new DomainError("At least one alcohol variation is required");
  const activeVariantCount =
    orm
      .select({ count: count() })
      .from(menuItemVariants)
      .where(and(eq(menuItemVariants.menuItemId, menuItemId), eq(menuItemVariants.active, true)))
      .get()?.count ?? 0;
  if (activeVariantCount === 0) throw new DomainError("Active alcohol items need at least one active variation");
}

export function replaceAlcoholVariants(orm: HubOrm, menuItemId: string, variants: CreateAlcoholItemInput["variants"]): void {
  const existing = orm.select({ id: menuItemVariants.id }).from(menuItemVariants).where(eq(menuItemVariants.menuItemId, menuItemId)).all();
  const keptIds = new Set<string>();
  variants.forEach((variant, index) => {
    const id = variant.id ?? `${menuItemId}-${variant.kind ?? "variant"}-${index}`;
    const existingVariant = variant.id
      ? orm.select({ menuItemId: menuItemVariants.menuItemId }).from(menuItemVariants).where(eq(menuItemVariants.id, variant.id)).get()
      : undefined;
    if (existingVariant && existingVariant.menuItemId !== menuItemId) throw new DomainError("Alcohol variation belongs to another item");
    keptIds.add(id);
    const row = {
      menuItemId,
      label: variant.label,
      kind: variant.kind ?? "default",
      pricePaise: variant.pricePaise,
      volumeMl: variant.volumeMl ?? null,
      inventoryAction: variant.inventoryAction ?? "none",
      sortOrder: variant.sortOrder ?? index,
      active: variant.active ?? true
    };
    const updated = orm.update(menuItemVariants).set(row).where(and(eq(menuItemVariants.id, id), eq(menuItemVariants.menuItemId, menuItemId))).run();
    if (updated.changes === 0) {
      orm.insert(menuItemVariants).values({ id, ...row }).run();
    }
  });
  for (const variant of existing) {
    if (keptIds.has(variant.id)) continue;
    const usage = orm.select({ count: count() }).from(orderItems).where(eq(orderItems.menuItemVariantId, variant.id)).get()?.count ?? 0;
    if (usage > 0) {
      orm.update(menuItemVariants).set({ active: false }).where(eq(menuItemVariants.id, variant.id)).run();
    } else {
      orm.delete(menuItemVariants).where(eq(menuItemVariants.id, variant.id)).run();
    }
  }
}

export function replaceAlcoholRecipe(orm: HubOrm, menuItemId: string, ingredients: CreateAlcoholItemInput["recipeIngredients"]): void {
  orm.delete(alcoholRecipeIngredients).where(eq(alcoholRecipeIngredients.productMenuItemId, menuItemId)).run();
  for (const ingredient of ingredients ?? []) {
    const liquor = orm.select({ type: alcoholProfiles.type }).from(alcoholProfiles).where(eq(alcoholProfiles.menuItemId, ingredient.liquorMenuItemId)).get();
    if (!liquor || liquor.type !== "plain_liquor") throw new DomainError("Cocktail recipes can only use plain liquor items");
    orm
      .insert(alcoholRecipeIngredients)
      .values({
        id: makeId("recipe"),
        productMenuItemId: menuItemId,
        liquorMenuItemId: ingredient.liquorMenuItemId,
        mlPerUnit: ingredient.mlPerUnit
      })
      .run();
  }
}

function listAlcoholRecipes(db: SqliteDatabase): Map<string, Array<{ id: string; liquor_menu_item_id: string; liquor_name: string; ml_per_unit: number }>> {
  const rows = db
    .prepare(
      `SELECT ari.id, ari.product_menu_item_id, ari.liquor_menu_item_id, mi.name AS liquor_name, ari.ml_per_unit
       FROM alcohol_recipe_ingredients ari
       JOIN menu_items mi ON mi.id = ari.liquor_menu_item_id
       ORDER BY mi.name`
    )
    .all() as Array<{ id: string; product_menu_item_id: string; liquor_menu_item_id: string; liquor_name: string; ml_per_unit: number }>;
  const recipes = new Map<string, Array<{ id: string; liquor_menu_item_id: string; liquor_name: string; ml_per_unit: number }>>();
  for (const row of rows) {
    const list = recipes.get(row.product_menu_item_id) ?? [];
    list.push({ id: row.id, liquor_menu_item_id: row.liquor_menu_item_id, liquor_name: row.liquor_name, ml_per_unit: row.ml_per_unit });
    recipes.set(row.product_menu_item_id, list);
  }
  return recipes;
}
