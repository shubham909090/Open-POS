import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HubDatabase } from "../db/database.js";

describe("database app schema compatibility", () => {
  it("refuses to open a database marked by a newer app schema", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-schema-version-"));
    const database = new HubDatabase(join(root, "hub.sqlite"));
    database.migrate();
    database.markAppSchemaVersion(99);

    expect(() => database.assertCompatibleAppSchema(98)).toThrow("newer app schema");

    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});

