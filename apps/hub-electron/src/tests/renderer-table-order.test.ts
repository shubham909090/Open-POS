import { describe, expect, it } from "vitest";
import { sortTables, sortTablesByFloor } from "../renderer/lib/table-order.js";

const table = (name: string, sort_order: number, floor_id = "main") => ({ name, sort_order, floor_id });

describe("table order", () => {
  it("lists tables by natural name by default, ignoring saved positions", () => {
    const tables = [table("T10", 0), table("T2", 1), table("T1", 2), table("A1", 3)];
    expect(sortTables(tables, "name").map((entry) => entry.name)).toEqual(["A1", "T1", "T2", "T10"]);
  });

  it("keeps the saved manual positions in custom order, with natural names breaking ties", () => {
    const tables = [table("T10", 0), table("T2", 1), table("T3", 1), table("T1", 2)];
    expect(sortTables(tables, "custom").map((entry) => entry.name)).toEqual(["T10", "T2", "T3", "T1"]);
  });

  it("groups pickers floor by floor in floor order", () => {
    const tables = [table("P2", 0, "patio"), table("T10", 0), table("P1", 1, "patio"), table("T2", 1)];
    const floors = [{ id: "main" }, { id: "patio" }];
    expect(sortTablesByFloor(tables, floors, "name").map((entry) => entry.name)).toEqual(["T2", "T10", "P1", "P2"]);
  });
});
