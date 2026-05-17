type TableLike = {
  id: string;
  name?: string | null;
  floor_id?: string | null;
  floor_name?: string | null;
};

type FloorLike = {
  id: string;
  name: string;
  active?: boolean | number;
};

export function groupTablesByFloor<TTable extends TableLike>(
  tables: TTable[],
  floors: FloorLike[] = []
): Array<{ floorId: string; floorName: string; tables: TTable[] }> {
  const activeFloors = floors.filter((floor) => floor.active !== false && floor.active !== 0);
  const groups = new Map<string, { floorId: string; floorName: string; tables: TTable[] }>();

  for (const floor of activeFloors) {
    groups.set(floor.id, { floorId: floor.id, floorName: floor.name, tables: [] });
  }

  for (const table of tables) {
    const floorId = table.floor_id || "unknown-floor";
    const existing = groups.get(floorId);
    if (existing) {
      existing.tables.push(table);
      continue;
    }
    groups.set(floorId, {
      floorId,
      floorName: table.floor_name || "Other tables",
      tables: [table]
    });
  }

  return Array.from(groups.values()).filter((group) => group.tables.length > 0);
}

export function clampTransferQuantity(value: string | number | undefined, max: number): number {
  const upper = Math.max(0, Math.trunc(max || 0));
  if (upper <= 0) return 0;
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(/\D/g, "") || 1);
  return Math.min(upper, Math.max(1, Math.trunc(numeric || 1)));
}

export function normaliseTransferQuantityInput(value: string, max: number): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return String(clampTransferQuantity(digits, max));
}

export function stepTransferQuantity(value: string | undefined, delta: number, max: number): string {
  return String(clampTransferQuantity(clampTransferQuantity(value, max) + delta, max));
}

export function filterTablesForSearch<TTable extends TableLike>(tables: TTable[], search: string): TTable[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return tables;
  return tables.filter((table) =>
    [table.name, table.floor_name]
      .filter(Boolean)
      .some((part) => String(part).toLowerCase().includes(needle))
  );
}
