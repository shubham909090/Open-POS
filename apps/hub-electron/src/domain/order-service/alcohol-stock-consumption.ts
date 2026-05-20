import { and, eq } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { alcoholStockMovements } from "../../db/drizzle-schema.js";
import { calculateAlcoholUsageForItems, type AlcoholUsage } from "./alcohol-usage.js";
import { recordAlcoholMovement, requireAlcoholStock, writeAlcoholStock } from "./alcohol-stock.js";
import { listOrderItems } from "./order-item-queries.js";
import type { AlcoholStockRow, OrderItemRow } from "./types.js";

type AlcoholStockDelta = { sealedLarge: number; openLargeMl: number; sealedSmall: number };
type AlcoholMovementSource = "bill_settlement" | "bill_history_edit";

export function deductAlcoholStockForPaidBill(orm: HubOrm, db: SqliteDatabase, billId: string, orderId: string): void {
  const existing = orm
    .select({ id: alcoholStockMovements.id })
    .from(alcoholStockMovements)
    .where(and(eq(alcoholStockMovements.sourceType, "bill_settlement"), eq(alcoholStockMovements.sourceId, billId)))
    .get();
  if (existing) return;

  const usage = calculateAlcoholUsageForItems(listOrderItems(orm, orderId).filter((item) => item.quantity > 0 && item.status !== "cancelled"));
  applyAlcoholUsage(db, orm, billId, usage, "bill_settlement");
}

export function calculatePendingAlcoholUsage(db: SqliteDatabase): AlcoholUsage {
  const rows = db
    .prepare(
      `SELECT oi.*
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN bills b ON b.order_id = o.id
       WHERE oi.status != 'cancelled'
         AND oi.quantity > 0
         AND o.status IN ('open', 'billed')
         AND COALESCE(b.status, 'pending') != 'paid'`
    )
    .all() as OrderItemRow[];
  return calculateAlcoholUsageForItems(rows);
}

export function applyAlcoholUsageDeltaForHistoryEdit(orm: HubOrm, db: SqliteDatabase, billId: string, before: AlcoholUsage, after: AlcoholUsage): void {
  const menuItemIds = new Set([...before.keys(), ...after.keys()]);
  for (const menuItemId of menuItemIds) {
    const oldUsage = before.get(menuItemId) ?? { largeMl: 0, largeBottles: 0, smallBottles: 0 };
    const newUsage = after.get(menuItemId) ?? { largeMl: 0, largeBottles: 0, smallBottles: 0 };
    applyAlcoholUsageDelta(db, orm, billId, menuItemId, {
      largeBottles: newUsage.largeBottles - oldUsage.largeBottles,
      smallBottles: newUsage.smallBottles - oldUsage.smallBottles,
      largeMl: newUsage.largeMl - oldUsage.largeMl
    });
  }
}

function applyAlcoholUsage(db: SqliteDatabase, orm: HubOrm, billId: string, usage: AlcoholUsage, sourceType: AlcoholMovementSource): void {
  for (const [menuItemId, amount] of usage.entries()) {
    applyAlcoholUsageDelta(db, orm, billId, menuItemId, amount, sourceType);
  }
}

function applyAlcoholUsageDelta(
  db: SqliteDatabase,
  orm: HubOrm,
  billId: string,
  menuItemId: string,
  delta: { largeMl: number; largeBottles: number; smallBottles: number },
  sourceType: AlcoholMovementSource = "bill_history_edit"
): void {
  if (delta.largeBottles) applyAlcoholStockDelta(db, orm, menuItemId, billId, { sealedLarge: -delta.largeBottles, openLargeMl: 0, sealedSmall: 0 }, sourceType);
  if (delta.smallBottles) applyAlcoholStockDelta(db, orm, menuItemId, billId, { sealedLarge: 0, openLargeMl: 0, sealedSmall: -delta.smallBottles }, sourceType);
  if (delta.largeMl > 0) {
    consumeAlcoholLargeMl(db, orm, menuItemId, billId, delta.largeMl, sourceType);
  } else if (delta.largeMl < 0) {
    applyAlcoholStockDelta(db, orm, menuItemId, billId, { sealedLarge: 0, openLargeMl: -delta.largeMl, sealedSmall: 0 }, sourceType);
  }
}

function applyAlcoholStockDelta(db: SqliteDatabase, orm: HubOrm, menuItemId: string, billId: string, delta: AlcoholStockDelta, sourceType: AlcoholMovementSource): void {
  const stock = requireAlcoholStock(db, menuItemId);
  const next = {
    sealedLarge: stock.sealed_large_count + delta.sealedLarge,
    openLargeMl: stock.open_large_ml + delta.openLargeMl,
    sealedSmall: stock.sealed_small_count + delta.sealedSmall
  };
  if (sourceType === "bill_history_edit" && delta.openLargeMl > 0 && stock.large_bottle_ml > 0 && next.openLargeMl >= stock.large_bottle_ml) {
    const restoredSealed = Math.floor(next.openLargeMl / stock.large_bottle_ml);
    next.sealedLarge += restoredSealed;
    next.openLargeMl -= restoredSealed * stock.large_bottle_ml;
  }
  writeAlcoholStock(orm, menuItemId, next.sealedLarge, next.openLargeMl, next.sealedSmall, true);
  recordAlcoholStockMovement(orm, stock, menuItemId, billId, next, sourceType);
}

function consumeAlcoholLargeMl(db: SqliteDatabase, orm: HubOrm, menuItemId: string, billId: string, ml: number, sourceType: AlcoholMovementSource): void {
  const stock = requireAlcoholStock(db, menuItemId);

  let sealedLarge = stock.sealed_large_count;
  let openLargeMl = stock.open_large_ml;
  let remaining = ml;
  while (remaining > 0) {
    if (openLargeMl <= 0 && sealedLarge > 0) {
      sealedLarge -= 1;
      openLargeMl += stock.large_bottle_ml;
    }
    if (openLargeMl > 0) {
      const used = Math.min(openLargeMl, remaining);
      openLargeMl -= used;
      remaining -= used;
    } else {
      openLargeMl -= remaining;
      remaining = 0;
    }
  }

  writeAlcoholStock(orm, menuItemId, sealedLarge, openLargeMl, stock.sealed_small_count, true);
  recordAlcoholStockMovement(orm, stock, menuItemId, billId, { sealedLarge, openLargeMl, sealedSmall: stock.sealed_small_count }, sourceType);
}

function recordAlcoholStockMovement(
  orm: HubOrm,
  stock: AlcoholStockRow,
  menuItemId: string,
  billId: string,
  next: { sealedLarge: number; openLargeMl: number; sealedSmall: number },
  sourceType: AlcoholMovementSource
): void {
  recordAlcoholMovement(orm, {
    menuItemId,
    sourceType,
    sourceId: billId,
    deltaSealedLarge: next.sealedLarge - stock.sealed_large_count,
    deltaOpenLargeMl: next.openLargeMl - stock.open_large_ml,
    deltaSealedSmall: next.sealedSmall - stock.sealed_small_count,
    balanceSealedLarge: next.sealedLarge,
    balanceOpenLargeMl: next.openLargeMl,
    balanceSealedSmall: next.sealedSmall
  });
}
