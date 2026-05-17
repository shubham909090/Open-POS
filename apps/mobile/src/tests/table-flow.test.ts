import { describe, expect, it } from "vitest";
import { clampTransferQuantity, filterTablesForSearch, groupTablesByFloor, normaliseTransferQuantityInput, stepTransferQuantity } from "../lib/table-flow";

describe("mobile table flow helpers", () => {
  it("groups active tables under their floors in floor order", () => {
    const tables = [
      { id: "t-2", name: "B1", floor_id: "f-2", floor_name: "Balcony" },
      { id: "t-1", name: "G1", floor_id: "f-1", floor_name: "Ground" },
      { id: "t-3", name: "Loose", floor_id: "missing", floor_name: "Patio" }
    ];

    expect(groupTablesByFloor(tables, [
      { id: "f-1", name: "Ground", active: true },
      { id: "f-2", name: "Balcony", active: true }
    ])).toEqual([
      { floorId: "f-1", floorName: "Ground", tables: [tables[1]] },
      { floorId: "f-2", floorName: "Balcony", tables: [tables[0]] },
      { floorId: "missing", floorName: "Patio", tables: [tables[2]] }
    ]);
  });

  it("keeps transfer quantities between one and available quantity", () => {
    expect(clampTransferQuantity("999", 3)).toBe(3);
    expect(clampTransferQuantity("0", 3)).toBe(1);
    expect(clampTransferQuantity("", 3)).toBe(1);
    expect(clampTransferQuantity("2 plates", 3)).toBe(2);
    expect(clampTransferQuantity("4", 0)).toBe(0);
  });

  it("normalises typed transfer input and plus/minus steps", () => {
    expect(normaliseTransferQuantityInput("999", 3)).toBe("3");
    expect(normaliseTransferQuantityInput("abc", 3)).toBe("");
    expect(stepTransferQuantity("3", 1, 3)).toBe("3");
    expect(stepTransferQuantity("1", -1, 3)).toBe("1");
    expect(stepTransferQuantity("", 1, 3)).toBe("2");
  });

  it("filters many transfer targets by table or floor name", () => {
    const tables = [
      { id: "t-1", name: "G1", floor_name: "Ground" },
      { id: "t-2", name: "B4", floor_name: "Balcony" },
      { id: "t-3", name: "Roof 2", floor_name: "Terrace" }
    ];

    expect(filterTablesForSearch(tables, "bal")).toEqual([tables[1]]);
    expect(filterTablesForSearch(tables, "roof")).toEqual([tables[2]]);
    expect(filterTablesForSearch(tables, "")).toEqual(tables);
  });
});
