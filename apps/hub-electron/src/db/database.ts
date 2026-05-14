import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
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
    this.bridgeLegacyMigrations(migrationsFolder);
    migrate(this.orm, { migrationsFolder });
  }

  private bridgeLegacyMigrations(migrationsFolder: string): void {
    if (!this.tableExists("migrations") || !this.tableExists("bills") || !this.tableExists("orders")) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      );
    `);

    const migrationEntries = this.loadMigrationEntries(migrationsFolder);
    const appliedHashes = new Set(
      this.db.prepare('SELECT hash FROM "__drizzle_migrations"').all().map((row) => (row as { hash: string }).hash)
    );

    const shouldMarkApplied: Record<string, boolean> = {
      "0000_late_onslaught":
        this.tableExists("migrations") &&
        this.tableExists("menu_items") &&
        this.tableExists("sync_outbox") &&
        this.tableExists("print_jobs"),
      "0001_daily_reports": this.tableExists("daily_report_snapshots"),
      "0002_restaurant_workflow":
        this.tableExists("sale_groups") &&
        this.tableExists("bill_revisions") &&
        this.columnExists("bills", "tax_breakdown_json") &&
        this.columnExists("daily_report_snapshots", "group_summaries_json"),
      "0003_captain_security_notifications":
        this.tableExists("ready_notifications") &&
        this.columnExists("orders", "captain_device_id") &&
        this.columnExists("orders", "created_by_role")
    };

    const insert = this.db.prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)');
    for (const entry of migrationEntries) {
      if (!shouldMarkApplied[entry.tag] || appliedHashes.has(entry.hash)) continue;
      insert.run(entry.hash, entry.createdAt);
      appliedHashes.add(entry.hash);
    }
  }

  private loadMigrationEntries(migrationsFolder: string): Array<{ tag: string; hash: string; createdAt: number }> {
    const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
      entries: Array<{ tag: string; when: number }>;
    };
    return journal.entries.map((entry) => {
      const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), "utf8");
      return {
        tag: entry.tag,
        createdAt: entry.when,
        hash: createHash("sha256").update(sql).digest("hex")
      };
    });
  }

  private tableExists(name: string): boolean {
    return Boolean(
      this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(name)
    );
  }

  private columnExists(tableName: string, columnName: string): boolean {
    return this.db
      .prepare(`PRAGMA table_info(${JSON.stringify(tableName)})`)
      .all()
      .some((row) => (row as { name: string }).name === columnName);
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
      }
    });

    seed();
  }

  close(): void {
    this.db.close();
  }
}
