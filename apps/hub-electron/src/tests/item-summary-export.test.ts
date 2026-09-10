import { describe, expect, it } from "vitest";
import { buildItemSummaryExport } from "../renderer/components/reports/item-summary-export.js";
import type { DailyReportDetail } from "../renderer/hub-api.js";

const summary: DailyReportDetail = {
  pos_day_id: "day", business_date: "2026-09-10", status: "finalized", bill_count: 1,
  gross_sales_paise: 12345, final_sales_paise: 12345, total_payments_paise: 12345, finalized_at: "2026-09-10T20:00:00Z",
  billSummaries: [], groupSummaries: [],
  itemSummaries: Array.from({ length: 9 }, (_, i) => ({ menuItemId: `item-${i}`, name: i === 0 ? 'Crème, "special"' : i === 1 ? '=HYPERLINK("bad")' : `Dish ${i}`, saleGroupId: "food", saleGroupName: "Food", saleGroupKind: "food", quantity: i + 1, grossSalesPaise: 12345, ncQuantity: 0, ncGrossSalesPaise: 0 })),
};

describe("item summary export", () => {
  it("exports every row with numeric rupees, Excel UTF-8 and escaped names", () => {
    const result = buildItemSummaryExport(summary);
    expect(result.fileName).toBe("item-summary-2026-09-10.csv");
    expect(result.csv).toContain('\uFEFFItem,Group,Sold,Gross (INR)\r\n');
    expect(result.csv).toContain('"Crème, ""special""",Food,1,123.45');
    expect(result.csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(result.csv).toContain('Dish 8,Food,9,123.45');
    expect(result.csv.trim().split("\r\n")).toHaveLength(10);
  });
});
