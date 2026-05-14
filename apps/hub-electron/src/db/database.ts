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
      const saleGroups = [
        ["sg-food", "Food", "food", "Food", "KOT", '[{"name":"CGST","rateBps":250},{"name":"SGST","rateBps":250}]'],
        ["sg-alcohol", "Alcohol", "alcohol", "Alcohol", "BOT", '[{"name":"VAT","rateBps":1000}]'],
        ["sg-beverage", "Beverage", "beverage", "Beverage", "KOT", '[{"name":"CGST","rateBps":250},{"name":"SGST","rateBps":250}]'],
        ["sg-other", "Other", "other", "Other", "KOT", "[]"]
      ] as const;

      for (const group of saleGroups) {
        this.orm
          .insert(schema.saleGroups)
          .values({
            id: group[0],
            name: group[1],
            kind: group[2],
            reportLabel: group[3],
            ticketLabel: group[4],
            taxComponentsJson: group[5],
            active: true
          })
          .onConflictDoNothing()
          .run();
      }

      this.orm.insert(schema.floors).values({ id: "floor-main", name: "Main", active: true }).onConflictDoNothing().run();

      for (const table of ["T1", "T2", "T3", "T4"]) {
        this.orm
          .insert(schema.restaurantTables)
          .values({
            id: `table-${table.toLowerCase()}`,
            floorId: "floor-main",
            name: table,
            active: true,
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
            printerMode: "network",
            active: true
          })
          .onConflictDoNothing()
          .run();
      }

      const items = [
        ["item-paneer-tikka", "Paneer Tikka", 26000, "unit-kitchen", "sg-food"],
        ["item-dal-fry", "Dal Fry", 18000, "unit-kitchen", "sg-food"],
        ["item-lassi", "Sweet Lassi", 9000, "unit-bar", "sg-beverage"]
      ] as const;

      for (const item of items) {
        this.orm
          .insert(schema.menuItems)
          .values({
            id: item[0],
            name: item[1],
            pricePaise: item[2],
            productionUnitId: item[3],
            saleGroupId: item[4],
            active: true
          })
          .onConflictDoNothing()
          .run();
        this.orm
          .insert(schema.menuItemVariants)
          .values({
            id: `${item[0]}-default`,
            menuItemId: item[0],
            label: "Regular",
            kind: "default",
            pricePaise: item[2],
            volumeMl: null,
            inventoryAction: "none",
            sortOrder: 0,
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
