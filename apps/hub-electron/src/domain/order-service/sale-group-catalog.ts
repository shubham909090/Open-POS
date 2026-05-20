import type { SqliteDatabase } from "../../db/database.js";
import { DomainError } from "../errors.js";
import type { SaleGroupRow } from "./types.js";

export function listSaleGroupReadModels(db: SqliteDatabase, includeInactive = true): unknown[] {
  const where = includeInactive ? "" : "WHERE sg.active = 1";
  return db
    .prepare(
      `SELECT sg.id, sg.name, sg.kind, sg.report_label, sg.ticket_label, sg.tax_components_json,
        sg.default_production_unit_id, pu.name AS default_production_unit_name, sg.active
       FROM sale_groups sg
       LEFT JOIN production_units pu ON pu.id = sg.default_production_unit_id
       ${where}
       ORDER BY sg.active DESC, sg.name`
    )
    .all();
}

export function requireSaleGroup(db: SqliteDatabase, id: string): SaleGroupRow {
  const group = db
    .prepare(
      `SELECT id, name, kind, report_label, ticket_label, tax_components_json, default_production_unit_id
       FROM sale_groups
       WHERE id = ? AND active = 1`
    )
    .get(id) as SaleGroupRow | undefined;
  if (!group) throw new DomainError("Sale group not found", 404);
  return group;
}

export function resolveSaleGroupRef(db: SqliteDatabase, value: string): string {
  const ref = value.trim();
  const row = db
    .prepare("SELECT id FROM sale_groups WHERE active = 1 AND (lower(id) = lower(?) OR lower(name) = lower(?) OR lower(report_label) = lower(?)) LIMIT 1")
    .get(ref, ref, ref) as { id: string } | undefined;
  if (!row) throw new DomainError(`Sale category "${ref}" not found`);
  return row.id;
}
