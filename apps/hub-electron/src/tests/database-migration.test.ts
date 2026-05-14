import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { HubDatabase } from "../db/database.js";

const tempDirs: string[] = [];

function createLegacy0000Database(path: string) {
  const db = new Database(path);
  const migration = readFileSync(fileURLToPath(new URL("../../drizzle/0000_late_onslaught.sql", import.meta.url)), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    db.exec(statement);
  }
  db.prepare("INSERT INTO migrations (id, applied_at) VALUES (?, ?)").run("0000_late_onslaught", new Date().toISOString());
  db.close();
}

describe("HubDatabase migrations", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("bridges old custom migration metadata before running Drizzle migrations", () => {
    const dir = mkdtempSync(join(tmpdir(), "gaurav-pos-legacy-db-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "hub.sqlite");
    createLegacy0000Database(dbPath);

    const database = new HubDatabase(dbPath);

    expect(() => database.migrate()).not.toThrow();
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM "__drizzle_migrations"').get()).toEqual({ count: 4 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM sale_groups").get()).toEqual({ count: 4 });
    expect(
      database.db.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('bills') WHERE name = 'tax_breakdown_json'").get()
    ).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ready_notifications'").get()).toEqual({
      name: "ready_notifications"
    });

    database.close();
  });
});
