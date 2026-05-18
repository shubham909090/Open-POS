import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HubDatabase } from "./db/database.js";

export function runSqliteSelfTest(): void {
  const root = mkdtempSync(join(tmpdir(), "gaurav-pos-sqlite-self-test-"));
  const databasePath = join(root, "self-test.sqlite");
  const database = new HubDatabase(databasePath);
  try {
    database.migrate();
    database.integrityCheck();
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
}

