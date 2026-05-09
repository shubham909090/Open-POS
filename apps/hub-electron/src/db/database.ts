import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { migrations } from "./schema.js";

export type SqliteDatabase = Database.Database;

export class HubDatabase {
  readonly db: SqliteDatabase;

  constructor(path = ":memory:") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.db = new Database(path);
    this.db.pragma("foreign_keys = ON");
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    for (const migration of migrations) {
      const applied = this.db
        .prepare("SELECT id FROM migrations WHERE id = ?")
        .get(migration.id);

      if (applied) continue;

      const runMigration = this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db
          .prepare("INSERT INTO migrations (id, applied_at) VALUES (?, ?)")
          .run(migration.id, new Date().toISOString());
      });

      runMigration();
    }
  }

  seedDemoData(): void {
    const seed = this.db.transaction(() => {
      this.db
        .prepare("INSERT OR IGNORE INTO floors (id, name) VALUES (?, ?)")
        .run("floor-main", "Main");

      for (const table of ["T1", "T2", "T3", "T4"]) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO restaurant_tables
              (id, floor_id, name, status, current_order_id, occupied_at)
             VALUES (?, ?, ?, 'free', NULL, NULL)`
          )
          .run(`table-${table.toLowerCase()}`, "floor-main", table);
      }

      const units = [
        ["unit-kitchen", "Kitchen", "192.168.1.51", 9100],
        ["unit-bar", "Bar", "192.168.1.52", 9100]
      ] as const;

      for (const unit of units) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO production_units
              (id, name, printer_host, printer_port, kds_enabled)
             VALUES (?, ?, ?, ?, 1)`
          )
          .run(...unit);
      }

      const items = [
        ["item-paneer-tikka", "Paneer Tikka", 26000, "unit-kitchen"],
        ["item-dal-fry", "Dal Fry", 18000, "unit-kitchen"],
        ["item-lassi", "Sweet Lassi", 9000, "unit-bar"]
      ] as const;

      for (const item of items) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO menu_items
              (id, name, price_paise, production_unit_id, active)
             VALUES (?, ?, ?, ?, 1)`
          )
          .run(...item);
      }
    });

    seed();
  }

  close(): void {
    this.db.close();
  }
}
