import type {
  AdjustAlcoholStockInput,
  CreateAlcoholItemInput,
  CreateMenuItemInput,
  DomainEvent,
  UpdateAlcoholItemInput,
  UpdateMenuItemInput
} from "@gaurav-pos/shared";
import { eq } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { alcoholProfiles, alcoholStockLevels, menuItems, menuItemVariants } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import type { AlcoholUsage } from "./alcohol-usage.js";
import { listAlcoholCatalogReadModel } from "./alcohol-catalog.js";
import { listAlcoholStockMovementReadModels, listAlcoholStorageReadModels } from "./alcohol-stock.js";
import {
  csvBoolean,
  csvInteger,
  csvMoneyToPaise,
  csvMoneyToPaiseOptional,
  csvText,
  parseCsvRows,
  requireCsvText
} from "./csv-import.js";
import type { AlcoholStockRow, CsvImportResult, MenuItemVariantRow } from "./types.js";

export type AlcoholActionContext = {
  orm: HubOrm;
  db: SqliteDatabase;
  calculatePendingAlcoholUsage: () => AlcoholUsage;
  listVariantsForMenuItems: (menuItemIds: string[], includeInactive: boolean) => Map<string, MenuItemVariantRow[]>;
  defaultAlcoholProductionUnitId: () => string | null;
  requireProductionUnit: (productionUnitId: string) => unknown;
  assertAlcoholRecipeMatchesType: (type: CreateAlcoholItemInput["type"], ingredients: CreateAlcoholItemInput["recipeIngredients"]) => void;
  assertAlcoholVariantsMatchType: (type: CreateAlcoholItemInput["type"], variants: CreateAlcoholItemInput["variants"]) => void;
  assertAlcoholHasSellableVariant: (active: boolean, variants?: CreateAlcoholItemInput["variants"], menuItemId?: string) => void;
  createMenuItem: (input: CreateMenuItemInput) => { id: string };
  updateMenuItem: (id: string, input: UpdateMenuItemInput) => { id: string };
  replaceAlcoholVariants: (menuItemId: string, variants: CreateAlcoholItemInput["variants"]) => void;
  replaceAlcoholRecipe: (menuItemId: string, ingredients: CreateAlcoholItemInput["recipeIngredients"]) => void;
  findMenuItemIdByName: (name: string) => string | null;
  resolveProductionUnitRef: (value: string | null) => string | null;
  parseAlcoholRecipeCsv: (value: string | null) => Array<{ liquorMenuItemId: string; mlPerUnit: number }>;
  requireAlcoholStock: (menuItemId: string) => AlcoholStockRow;
  writeAlcoholStock: (menuItemId: string, sealedLarge: number, openLargeMl: number, sealedSmall: number) => void;
  recordAlcoholMovement: (input: {
    menuItemId: string;
    sourceType: string;
    sourceId: string;
    deltaSealedLarge: number;
    deltaOpenLargeMl: number;
    deltaSealedSmall: number;
    balanceSealedLarge: number;
    balanceOpenLargeMl: number;
    balanceSealedSmall: number;
    approvedBy?: string | null;
  }) => void;
  verifyManagerApproval: (input: AdjustAlcoholStockInput["managerApproval"], action: string, aggregateType: string, aggregateId: string, requestedBy?: string) => void;
  verifyMasterApproval: (input: AdjustAlcoholStockInput["masterApproval"], action: string, aggregateType: string, aggregateId: string, requestedBy?: string) => void;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function listAlcoholCatalog(ctx: AlcoholActionContext): unknown {
  return listAlcoholCatalogReadModel(ctx.db, ctx.listVariantsForMenuItems, listAlcoholStorage(ctx));
}

export function listAlcoholStorage(ctx: AlcoholActionContext): unknown[] {
  return listAlcoholStorageReadModels(ctx.db, ctx.calculatePendingAlcoholUsage());
}

export function createAlcoholItem(ctx: AlcoholActionContext, input: CreateAlcoholItemInput): { id: string } {
  const run = ctx.db.transaction(() => {
    const unitId = input.productionUnitId !== undefined ? input.productionUnitId : ctx.defaultAlcoholProductionUnitId();
    if (unitId) ctx.requireProductionUnit(unitId);
    ctx.assertAlcoholRecipeMatchesType(input.type, input.recipeIngredients ?? []);
    ctx.assertAlcoholVariantsMatchType(input.type, input.variants);
    ctx.assertAlcoholHasSellableVariant(input.active ?? true, input.variants);
    const firstVariant = input.variants.find((variant) => variant.active !== false) ?? input.variants[0];
    if (!firstVariant) throw new DomainError("At least one alcohol variation is required");
    const item = ctx.createMenuItem({
      name: input.name,
      pricePaise: firstVariant.pricePaise,
      productionUnitId: unitId ?? null,
      saleGroupId: "sg-alcohol",
      active: input.active ?? true
    });
    ctx.orm.delete(menuItemVariants).where(eq(menuItemVariants.menuItemId, item.id)).run();
    ctx.orm
      .insert(alcoholProfiles)
      .values({
        menuItemId: item.id,
        type: input.type,
        largeBottleMl: input.largeBottleMl ?? 750,
        smallBottleMl: input.smallBottleMl ?? 180
      })
      .run();
    ctx.orm
      .insert(alcoholStockLevels)
      .values({
        menuItemId: item.id,
        sealedLargeCount: input.sealedLargeCount ?? 0,
        openLargeMl: input.openLargeMl ?? 0,
        sealedSmallCount: input.sealedSmallCount ?? 0,
        updatedAt: new Date().toISOString()
      })
      .run();
    ctx.replaceAlcoholVariants(item.id, input.variants);
    ctx.replaceAlcoholRecipe(item.id, input.recipeIngredients ?? []);
    ctx.appendEvent("alcohol_item.created", "menu_item", item.id, { ...input, id: item.id });
    return item;
  });
  return run();
}

export function importAlcoholItemsFromCsv(ctx: AlcoholActionContext, csv: string, type: "plain_liquor" | "prepared_product"): CsvImportResult {
  const run = ctx.db.transaction(() => {
    const rows = parseCsvRows(csv);
    const result: CsvImportResult = { created: 0, failed: 0, ids: [], errors: [] };
    for (const row of rows) {
      try {
        const name = requireCsvText(row, ["name", "item_name", "liquor_name", "product_name"]);
        if (ctx.findMenuItemIdByName(name)) throw new DomainError(`Alcohol item "${name}" already exists`);
        const productionUnitId = ctx.resolveProductionUnitRef(csvText(row, ["bar_counter", "kitchen_or_counter", "counter", "production_unit"]));
        const active = csvBoolean(csvText(row, ["active"]), true);
        const largeBottleMl = csvInteger(csvText(row, ["large_bottle_ml", "large_ml"]), 750);
        const smallBottleMl = csvInteger(csvText(row, ["small_bottle_ml", "small_ml"]), 180);
        const shotPricePaise = csvMoneyToPaiseOptional(csvText(row, ["shot_price", "price_30_ml", "thirty_ml_price"]));
        const smallPricePaise = csvMoneyToPaiseOptional(csvText(row, ["small_bottle_price", "small_price"]));
        const largePricePaise = csvMoneyToPaiseOptional(csvText(row, ["large_bottle_price", "large_price"]));
        const plainVariants: CreateAlcoholItemInput["variants"] = [
          ...(shotPricePaise > 0 ? [{ label: "30 ml", kind: "shot" as const, pricePaise: shotPricePaise, volumeMl: 30, inventoryAction: "large_ml" as const, sortOrder: 0, active: true }] : []),
          ...(smallPricePaise > 0 ? [{ label: `${smallBottleMl} ml`, kind: "small_bottle" as const, pricePaise: smallPricePaise, volumeMl: smallBottleMl, inventoryAction: "small_bottle" as const, sortOrder: 1, active: true }] : []),
          ...(largePricePaise > 0 ? [{ label: `${largeBottleMl} ml`, kind: "large_bottle" as const, pricePaise: largePricePaise, volumeMl: largeBottleMl, inventoryAction: "large_bottle" as const, sortOrder: 2, active: true }] : [])
        ];
        const created = type === "plain_liquor"
          ? createAlcoholItem(ctx, {
              type,
              name,
              productionUnitId,
              largeBottleMl,
              smallBottleMl,
              sealedLargeCount: csvInteger(csvText(row, ["sealed_large_count", "large_bottles", "large_stock"]), 0),
              openLargeMl: csvInteger(csvText(row, ["open_large_ml", "open_ml"]), 0),
              sealedSmallCount: csvInteger(csvText(row, ["sealed_small_count", "small_bottles", "small_stock"]), 0),
              variants: plainVariants,
              recipeIngredients: [],
              active
            })
          : createAlcoholItem(ctx, {
              type,
              name,
              productionUnitId,
              variants: [
                {
                  label: "Regular",
                  kind: "default",
                  pricePaise: csvMoneyToPaise(requireCsvText(row, ["price", "price_rupees", "rate"])),
                  volumeMl: null,
                  inventoryAction: "none",
                  sortOrder: 0,
                  active: true
                }
              ],
              recipeIngredients: ctx.parseAlcoholRecipeCsv(csvText(row, ["recipe", "recipe_ml", "ingredients"])),
              active
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

export function updateAlcoholItem(ctx: AlcoholActionContext, id: string, input: UpdateAlcoholItemInput): { id: string } {
  const run = ctx.db.transaction(() => {
    const existing = ctx.orm
      .select({ id: alcoholProfiles.menuItemId, type: alcoholProfiles.type, active: menuItems.active })
      .from(alcoholProfiles)
      .innerJoin(menuItems, eq(menuItems.id, alcoholProfiles.menuItemId))
      .where(eq(alcoholProfiles.menuItemId, id))
      .get();
    if (!existing) throw new DomainError("Alcohol item not found", 404);
    if (input.productionUnitId) ctx.requireProductionUnit(input.productionUnitId);
    if (input.type !== undefined && input.variants === undefined) throw new DomainError("Changing alcohol type requires variation setup");
    const nextType = input.type ?? (existing.type as "plain_liquor" | "prepared_product");
    const nextActive = input.active ?? Boolean(existing.active);
    ctx.assertAlcoholRecipeMatchesType(nextType, input.recipeIngredients ?? []);
    if (input.variants) ctx.assertAlcoholVariantsMatchType(nextType, input.variants);
    ctx.assertAlcoholHasSellableVariant(nextActive, input.variants, id);
    const firstVariant = input.variants?.find((variant) => variant.active !== false) ?? input.variants?.[0];
    ctx.updateMenuItem(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(firstVariant ? { pricePaise: firstVariant.pricePaise } : {}),
      ...(input.productionUnitId !== undefined ? { productionUnitId: input.productionUnitId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    });
    const profilePatch = {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.largeBottleMl !== undefined ? { largeBottleMl: input.largeBottleMl } : {}),
      ...(input.smallBottleMl !== undefined ? { smallBottleMl: input.smallBottleMl } : {})
    };
    if (Object.keys(profilePatch).length > 0) {
      ctx.orm
        .update(alcoholProfiles)
        .set(profilePatch)
        .where(eq(alcoholProfiles.menuItemId, id))
        .run();
    }
    if (input.variants) ctx.replaceAlcoholVariants(id, input.variants);
    if (nextType === "plain_liquor") {
      ctx.replaceAlcoholRecipe(id, []);
    } else if (input.recipeIngredients) {
      ctx.replaceAlcoholRecipe(id, input.recipeIngredients);
    }
    ctx.appendEvent("alcohol_item.updated", "menu_item", id, { id, ...input });
    return { id };
  });
  return run();
}

export function adjustAlcoholStock(ctx: AlcoholActionContext, menuItemId: string, input: AdjustAlcoholStockInput): { id: string } {
  const run = ctx.db.transaction(() => {
    const stock = ctx.requireAlcoholStock(menuItemId);
    const lowersStock =
      input.mode === "delta"
        ? (input.sealedLargeCount ?? 0) < 0 || (input.openLargeMl ?? 0) < 0 || (input.sealedSmallCount ?? 0) < 0
        : false;
    const usesExactStock = input.mode === "set";
    if (usesExactStock || lowersStock) {
      if (!input.masterApproval) {
        throw new DomainError(usesExactStock ? "Master PIN is required for exact liquor stock edits" : "Master PIN is required for lowering liquor stock", 403);
      }
      ctx.verifyMasterApproval(
        input.masterApproval,
        usesExactStock ? "alcohol_stock.set_exact" : "alcohol_stock.lower",
        "menu_item",
        menuItemId,
        input.masterApproval?.approvedBy ?? "owner"
      );
    } else {
      ctx.verifyManagerApproval(input.managerApproval, "alcohol_stock.adjust", "menu_item", menuItemId, input.managerApproval?.approvedBy ?? "manager");
    }
    const next = {
      sealedLarge: input.mode === "set" ? (input.sealedLargeCount ?? stock.sealed_large_count) : stock.sealed_large_count + (input.sealedLargeCount ?? 0),
      openLargeMl: input.mode === "set" ? (input.openLargeMl ?? stock.open_large_ml) : stock.open_large_ml + (input.openLargeMl ?? 0),
      sealedSmall: input.mode === "set" ? (input.sealedSmallCount ?? stock.sealed_small_count) : stock.sealed_small_count + (input.sealedSmallCount ?? 0)
    };
    ctx.writeAlcoholStock(menuItemId, next.sealedLarge, next.openLargeMl, next.sealedSmall);
    ctx.recordAlcoholMovement({
      menuItemId,
      sourceType: "manual_adjustment",
      sourceId: makeId("stockadj"),
      deltaSealedLarge: next.sealedLarge - stock.sealed_large_count,
      deltaOpenLargeMl: next.openLargeMl - stock.open_large_ml,
      deltaSealedSmall: next.sealedSmall - stock.sealed_small_count,
      balanceSealedLarge: next.sealedLarge,
      balanceOpenLargeMl: next.openLargeMl,
      balanceSealedSmall: next.sealedSmall,
      approvedBy: input.masterApproval?.approvedBy ?? input.managerApproval?.approvedBy ?? "manager"
    });
    ctx.appendEvent("alcohol_stock.adjusted", "menu_item", menuItemId, { menuItemId, mode: input.mode, approvedBy: input.masterApproval?.approvedBy ?? input.managerApproval?.approvedBy ?? "manager" });
    return { id: menuItemId };
  });
  return run();
}

export function listAlcoholStockMovements(ctx: AlcoholActionContext, limit = 100): unknown[] {
  return listAlcoholStockMovementReadModels(ctx.db, limit);
}
