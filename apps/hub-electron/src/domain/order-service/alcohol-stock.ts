import { eq } from "drizzle-orm";
import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { alcoholProfiles, alcoholStockLevels, alcoholStockMovements } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { makeId } from "../ids.js";
import type { AlcoholUsage } from "./alcohol-usage.js";
import type { AlcoholStockRow } from "./types.js";

export function listAlcoholStorageReadModels(db: SqliteDatabase, pending: AlcoholUsage): unknown[] {
  const items = db
    .prepare(
      `SELECT mi.id, mi.name, mi.active, ap.type, ap.large_bottle_ml, ap.small_bottle_ml,
        COALESCE(asl.sealed_large_count, 0) AS sealed_large_count,
        COALESCE(asl.open_large_ml, 0) AS open_large_ml,
        COALESCE(asl.sealed_small_count, 0) AS sealed_small_count
       FROM alcohol_profiles ap
       JOIN menu_items mi ON mi.id = ap.menu_item_id
       LEFT JOIN alcohol_stock_levels asl ON asl.menu_item_id = mi.id
       WHERE ap.type = 'plain_liquor'
       ORDER BY mi.active DESC, mi.name`
    )
    .all() as Array<Record<string, unknown> & {
      id: string;
      sealed_large_count: number;
      open_large_ml: number;
      sealed_small_count: number;
      large_bottle_ml: number;
      small_bottle_ml: number;
    }>;
  return items.map((item) => {
    const pendingUsage = pending.get(item.id) ?? { largeMl: 0, largeBottles: 0, smallBottles: 0 };
    const onHandMl = item.sealed_large_count * item.large_bottle_ml + item.open_large_ml + item.sealed_small_count * item.small_bottle_ml;
    const pendingMl = pendingUsage.largeMl + pendingUsage.largeBottles * item.large_bottle_ml + pendingUsage.smallBottles * item.small_bottle_ml;
    return {
      ...item,
      total_available_ml: onHandMl,
      pending_large_ml: pendingUsage.largeMl,
      pending_large_bottles: pendingUsage.largeBottles,
      pending_small_bottles: pendingUsage.smallBottles,
      pending_total_ml: pendingMl,
      expected_after_settlement_ml: onHandMl - pendingMl
    };
  });
}

export function listAlcoholStockMovementReadModels(db: SqliteDatabase, limit = 100): unknown[] {
  return db
    .prepare(
      `SELECT asm.id, asm.menu_item_id, mi.name AS item_name, asm.source_type, asm.source_id,
        asm.delta_sealed_large, asm.delta_open_large_ml, asm.delta_sealed_small,
        asm.balance_sealed_large, asm.balance_open_large_ml, asm.balance_sealed_small,
        asm.approved_by, asm.created_at
       FROM alcohol_stock_movements asm
       JOIN menu_items mi ON mi.id = asm.menu_item_id
       ORDER BY asm.created_at DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(limit, 500)));
}

export function requireAlcoholStock(db: SqliteDatabase, menuItemId: string): AlcoholStockRow {
  const row = db
    .prepare(
      `SELECT asl.menu_item_id, asl.sealed_large_count, asl.open_large_ml, asl.sealed_small_count,
        ap.large_bottle_ml, ap.small_bottle_ml
       FROM alcohol_stock_levels asl
       JOIN alcohol_profiles ap ON ap.menu_item_id = asl.menu_item_id
       WHERE asl.menu_item_id = ?`
    )
    .get(menuItemId) as AlcoholStockRow | undefined;
  if (!row) throw new DomainError("Alcohol stock item not found", 404);
  return row;
}

export function writeAlcoholStock(orm: HubOrm, menuItemId: string, sealedLarge: number, openLargeMl: number, sealedSmall: number, allowNegative = false): void {
  if (!allowNegative && (sealedLarge < 0 || openLargeMl < 0 || sealedSmall < 0)) {
    throw new DomainError("Alcohol stock cannot go below zero");
  }

  orm
    .update(alcoholStockLevels)
    .set({
      sealedLargeCount: sealedLarge,
      openLargeMl,
      sealedSmallCount: sealedSmall,
      updatedAt: new Date().toISOString()
    })
    .where(eq(alcoholStockLevels.menuItemId, menuItemId))
    .run();
}

export function recordAlcoholMovement(
  orm: HubOrm,
  input: {
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
  }
): void {
  orm
    .insert(alcoholStockMovements)
    .values({
      id: makeId("stockmove"),
      menuItemId: input.menuItemId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      deltaSealedLarge: input.deltaSealedLarge,
      deltaOpenLargeMl: input.deltaOpenLargeMl,
      deltaSealedSmall: input.deltaSealedSmall,
      balanceSealedLarge: input.balanceSealedLarge,
      balanceOpenLargeMl: input.balanceOpenLargeMl,
      balanceSealedSmall: input.balanceSealedSmall,
      approvedBy: input.approvedBy ?? null,
      createdAt: new Date().toISOString()
    })
    .run();
}
