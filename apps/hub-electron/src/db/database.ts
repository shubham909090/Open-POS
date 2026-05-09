import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./drizzle-schema.js";
import { migrations } from "./schema.js";

export type SqliteDatabase = Database.Database;
export type HubOrm = BetterSQLite3Database<typeof schema> & { $client: SqliteDatabase };

export class HubDatabase {
  readonly db: SqliteDatabase;
  readonly orm: HubOrm;

  constructor(path = ":memory:") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.db = new Database(path);
    this.db.pragma("foreign_keys = ON");
    this.orm = drizzle(this.db, { schema });
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    for (const migration of migrations) {
      const applied = this.orm
        .select({ id: schema.migrationsTable.id })
        .from(schema.migrationsTable)
        .where(eq(schema.migrationsTable.id, migration.id))
        .get();

      if (applied) continue;

      const runMigration = this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.orm.insert(schema.migrationsTable).values({
          id: migration.id,
          appliedAt: new Date().toISOString()
        }).run();
      });

      runMigration();
    }
  }

  seedDemoData(): void {
    const seed = this.db.transaction(() => {
      this.orm.insert(schema.floors).values({ id: "floor-main", name: "Main" }).onConflictDoNothing().run();

      for (const table of ["T1", "T2", "T3", "T4"]) {
        this.orm
          .insert(schema.restaurantTables)
          .values({
            id: `table-${table.toLowerCase()}`,
            floorId: "floor-main",
            name: table,
            status: "free"
          })
          .onConflictDoNothing()
          .run();
      }

      const units = [
        ["unit-kitchen", "Kitchen", "192.168.1.51", 9100],
        ["unit-bar", "Bar", "192.168.1.52", 9100]
      ] as const;

      for (const unit of units) {
        this.orm
          .insert(schema.productionUnits)
          .values({
            id: unit[0],
            name: unit[1],
            printerHost: unit[2],
            printerPort: unit[3],
            kdsEnabled: true,
            printerMode: "network"
          })
          .onConflictDoNothing()
          .run();
      }

      const items = [
        ["item-paneer-tikka", "Paneer Tikka", 26000, "unit-kitchen"],
        ["item-dal-fry", "Dal Fry", 18000, "unit-kitchen"],
        ["item-lassi", "Sweet Lassi", 9000, "unit-bar"]
      ] as const;

      for (const item of items) {
        this.orm
          .insert(schema.menuItems)
          .values({
            id: item[0],
            name: item[1],
            pricePaise: item[2],
            productionUnitId: item[3],
            active: true
          })
          .onConflictDoNothing()
          .run();
      }
    });

    seed();
  }

  close(): void {
    this.db.close();
  }
}
