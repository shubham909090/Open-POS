import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { searchMenuItems } from "@gaurav-pos/shared";
import { createTestHub } from "./helpers.js";

function buildMenuCsv(rows: number): string {
  return [
    "name,price,kitchen_or_counter,sale_category,active",
    ...Array.from({ length: rows }, (_, index) => {
      const group = index % 5 === 0 ? "Beverage" : "Food";
      const unit = index % 7 === 0 ? "Bar" : "Kitchen";
      return `Perf Item ${index + 1},${100 + index},${unit},${group},true`;
    })
  ].join("\n");
}

describe("performance smoke coverage", () => {
  it("handles a 500 item menu import/search/bootstrap without changing correctness", () => {
    const { orderService } = createTestHub();

    const importStart = performance.now();
    const result = orderService.importMenuItemsFromCsv(buildMenuCsv(500));
    const importMs = performance.now() - importStart;
    const bootstrapStart = performance.now();
    const bootstrap = orderService.bootstrap() as {
      menuItems: Array<{ id: string; name: string; active: boolean; sale_group_kind: string }>;
      tables: unknown[];
    };
    const bootstrapMs = performance.now() - bootstrapStart;
    const searchStart = performance.now();
    const matches = searchMenuItems(bootstrap.menuItems, "perf item 233", { limit: 8 });
    const searchMs = performance.now() - searchStart;

    expect(result.created).toBe(500);
    expect(result.failed).toBe(0);
    expect(bootstrap.menuItems.length).toBeGreaterThanOrEqual(500);
    expect(matches[0]?.name).toBe("Perf Item 233");
    expect(importMs).toBeLessThan(1_000);
    expect(bootstrapMs).toBeLessThan(200);
    expect(searchMs).toBeLessThan(120);
  });
});
