import { eq, inArray } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { productionUnits } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import type { UnitRow } from "./types.js";

export function listProductionUnitReadModels(db: SqliteDatabase): unknown[] {
  return db
    .prepare(
      `SELECT id, name, printer_mode, printer_name, printer_host, printer_port, kds_enabled, active
       FROM production_units
       ORDER BY active DESC, name`
    )
    .all();
}

export function getProductionUnitsByIds(orm: HubOrm, ids: string[]): Map<string, UnitRow> {
  if (ids.length === 0) return new Map();
  const rows = orm
    .select({
      id: productionUnits.id,
      name: productionUnits.name,
      printer_host: productionUnits.printerHost,
      printer_port: productionUnits.printerPort,
      printer_name: productionUnits.printerName
    })
    .from(productionUnits)
    .where(inArray(productionUnits.id, ids))
    .all();
  return new Map(rows.map((row) => [row.id, row]));
}

export function getProductionUnit(orm: HubOrm, productionUnitId: string): UnitRow | undefined {
  return orm
    .select({
      id: productionUnits.id,
      name: productionUnits.name,
      printer_host: productionUnits.printerHost,
      printer_port: productionUnits.printerPort,
      printer_name: productionUnits.printerName
    })
    .from(productionUnits)
    .where(eq(productionUnits.id, productionUnitId))
    .get();
}

export function getFirstActiveProductionUnit(db: SqliteDatabase): UnitRow | undefined {
  return db
    .prepare(
      `SELECT id, name, printer_host, printer_port, printer_name
       FROM production_units
       WHERE active = 1
       ORDER BY name
       LIMIT 1`
    )
    .get() as UnitRow | undefined;
}

export function resolveProductionUnitRef(db: SqliteDatabase, value: string | null): string | null {
  const ref = value?.trim();
  if (!ref) return null;
  const row = db
    .prepare("SELECT id FROM production_units WHERE active = 1 AND (lower(id) = lower(?) OR lower(name) = lower(?)) LIMIT 1")
    .get(ref, ref) as { id: string } | undefined;
  if (!row) throw new DomainError(`Kitchen/counter "${ref}" not found`);
  return row.id;
}

export function requireProductionUnit(orm: HubOrm, productionUnitId: string): void {
  const unit = orm
    .select({ id: productionUnits.id })
    .from(productionUnits)
    .where(eq(productionUnits.id, productionUnitId))
    .get();
  if (!unit) throw new DomainError("Production unit not found", 404);
}
