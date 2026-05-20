import { DomainError } from "../errors.js";
import type { CsvRow } from "./types.js";

export function parseCsvRows(csv: string): CsvRow[] {
  const records = parseCsvRecords(csv);
  if (records.length < 2) throw new DomainError("CSV needs a header row and at least one item row");
  const headerRecord = records[0];
  if (!headerRecord) throw new DomainError("CSV header row is empty");
  const headers = headerRecord.map((header) => normalizeCsvHeader(header));
  if (!headers.some(Boolean)) throw new DomainError("CSV header row is empty");
  return records
    .slice(1)
    .map((cells, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(headers.map((header, cellIndex) => [header, (cells[cellIndex] ?? "").trim()]))
    }))
    .filter((row) => Object.values(row.values).some((value) => value.length > 0));
}

export function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) records.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) records.push(row);
  if (quoted) throw new DomainError("CSV has an unclosed quoted cell");
  return records;
}

export function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function csvText(row: CsvRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row.values[normalizeCsvHeader(key)];
    if (value?.trim()) return value.trim();
  }
  return null;
}

export function requireCsvText(row: CsvRow, keys: string[]): string {
  const value = csvText(row, keys);
  if (!value) throw new DomainError(`Missing ${(keys[0] ?? "value").replaceAll("_", " ")}`);
  return value;
}

export function csvMoneyToPaise(value: string): number {
  const amount = Number(value.replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) throw new DomainError(`Invalid price "${value}"`);
  return Math.round(amount * 100);
}

export function csvMoneyToPaiseOptional(value: string | null): number {
  if (!value?.trim()) return 0;
  const amount = Number(value.replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(amount) || amount < 0) throw new DomainError(`Invalid price "${value}"`);
  return Math.round(amount * 100);
}

export function csvInteger(value: string | null, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value.replace(/,/g, "").trim());
  if (!Number.isInteger(parsed)) throw new DomainError(`Invalid number "${value}"`);
  return parsed;
}

export function csvBoolean(value: string | null, fallback: boolean): boolean {
  if (!value?.trim()) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "active"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "inactive", "disabled"].includes(normalized)) return false;
  throw new DomainError(`Invalid active value "${value}"`);
}
