import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as schema from "./drizzle-schema.js";

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
    const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
    migrate(this.orm, { migrationsFolder });
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

      this.orm
        .insert(schema.modifierGroups)
        .values({ id: "mod-spice", name: "Spice", selectionType: "single", minSelections: 0, maxSelections: 1, active: true })
        .onConflictDoNothing()
        .run();
      for (const option of [
        ["mod-spice-mild", "Mild"],
        ["mod-spice-medium", "Medium"],
        ["mod-spice-spicy", "Spicy"]
      ] as const) {
        this.orm
          .insert(schema.modifierOptions)
          .values({ id: option[0], groupId: "mod-spice", name: option[1], priceDeltaPaise: 0, active: true })
          .onConflictDoNothing()
          .run();
      }
      for (const menuItemId of ["item-paneer-tikka", "item-dal-fry"]) {
        this.orm
          .insert(schema.menuItemModifierGroups)
          .values({ menuItemId, groupId: "mod-spice", sortOrder: 0 })
          .onConflictDoNothing()
          .run();
      }
      for (const note of [
        ["note-jain", "Jain", "Jain preparation"],
        ["note-no-onion", "No Onion", "No onion"],
        ["note-less-oil", "Less Oil", "Less oil"]
      ] as const) {
        this.orm
          .insert(schema.noteTemplates)
          .values({ id: note[0], label: note[1], note: note[2], active: true })
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
