import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface DrizzleJournal {
  entries?: Array<{ idx?: number; tag?: string }>;
}

export function currentDbSchemaVersion(): number {
  const journalPath = fileURLToPath(new URL("../../drizzle/meta/_journal.json", import.meta.url));
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as DrizzleJournal;
  return journal.entries?.length ?? 0;
}

