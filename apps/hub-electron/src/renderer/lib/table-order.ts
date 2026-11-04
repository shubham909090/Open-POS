import { compareNaturalNames } from "@gaurav-pos/shared";

/**
 * How tables are listed on this hub.
 * - "name": natural name order (T2 before T10), the default.
 * - "custom": the manual positions saved in Settings (sort_order).
 */
export type TableOrderMode = "name" | "custom";

export const TABLE_ORDER_STORAGE_KEY = "hub-table-order";

export function readTableOrderMode(): TableOrderMode {
  try {
    return localStorage.getItem(TABLE_ORDER_STORAGE_KEY) === "custom" ? "custom" : "name";
  } catch {
    return "name";
  }
}

export function writeTableOrderMode(mode: TableOrderMode): void {
  try {
    localStorage.setItem(TABLE_ORDER_STORAGE_KEY, mode);
  } catch {
    // Preference only; the default order still works without storage.
  }
}

type OrderableTable = { name: string; sort_order?: number };

/** Returns a new array; floors keep their own order and are grouped by the caller. */
export function sortTables<T extends OrderableTable>(tables: readonly T[], mode: TableOrderMode): T[] {
  return [...tables].sort((left, right) =>
    mode === "custom"
      ? (left.sort_order ?? 0) - (right.sort_order ?? 0) || compareNaturalNames(left.name, right.name)
      : compareNaturalNames(left.name, right.name)
  );
}

/** Table pickers list floor by floor (floor positions are always manual), then tables by the hub's mode. */
export function sortTablesByFloor<T extends OrderableTable & { floor_id: string }>(
  tables: readonly T[],
  floors: ReadonlyArray<{ id: string }>,
  mode: TableOrderMode
): T[] {
  const floorIndex = new Map(floors.map((floor, index) => [floor.id, index]));
  const ordered = sortTables(tables, mode);
  return ordered
    .map((table, index) => ({ table, index }))
    .sort((left, right) =>
      (floorIndex.get(left.table.floor_id) ?? floors.length) - (floorIndex.get(right.table.floor_id) ?? floors.length) || left.index - right.index
    )
    .map(({ table }) => table);
}
