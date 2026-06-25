import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";

import { createTestHub, insertDailySnapshot } from "./helpers.js";

describe("OrderService report exports", () => {
  it("downloads a complete CSV pack for the selected finalized range", () => {
    const { database, orderService } = createTestHub();
    insertDailySnapshot(database, {
      id: "day-export-csv",
      businessDate: "2026-05-01",
      billCount: 1,
      grossSalesPaise: 12_000,
      discountPaise: 3_000,
      tipPaise: 1_000,
      finalSalesPaise: 10_000,
      cashPaise: 6_000,
      upiPaise: 4_000,
      groupSummaries: [
        { saleGroupId: "sg-food", name: "Food", kind: "food", quantity: 2, grossSalesPaise: 12_000, taxPaise: 600, finalSalesPaise: 10_000, ncQuantity: 0, ncGrossSalesPaise: 0 }
      ],
      itemSummaries: [
        { menuItemId: "item-dal-fry", name: "Dal Fry", saleGroupId: "sg-food", saleGroupName: "Food", saleGroupKind: "food", quantity: 2, grossSalesPaise: 12_000, ncQuantity: 0, ncGrossSalesPaise: 0 }
      ],
      billSummaries: [
        {
          billId: "bill-export-1",
          billNumber: 12,
          orderId: "order-export-1",
          tableName: "T1",
          status: "paid",
          subtotalPaise: 12_000,
          taxPaise: 600,
          totalPaise: 12_000,
          discountPaise: 3_000,
          tipPaise: 1_000,
          finalTotalPaise: 10_000,
          paidPaise: 10_000,
          settledAt: "2026-05-01T19:00:00.000Z",
          payments: [
            { method: "cash", amountPaise: 6_000, reference: null },
            { method: "upi", amountPaise: 4_000, reference: "UPI-1" }
          ],
          items: [
            { orderItemId: "oi-1", menuItemId: "item-dal-fry", menuItemVariantId: null, saleGroupId: "sg-food", productionUnitId: "unit-kitchen", name: "Dal Fry", quantity: 2, unitPricePaise: 6_000, lineTotalPaise: 12_000 }
          ]
        }
      ]
    });

    const file = orderService.exportRangeCsv({ from: "2026-05-01", to: "2026-05-01", includeBills: false });
    const zip = new AdmZip(file.body);

    expect(file.fileName).toBe("reports-2026-05-01-to-2026-05-01.zip");
    expect(zip.getEntries().map((entry) => entry.entryName).sort()).toEqual([
      "bill-history.csv",
      "bill-items.csv",
      "category-totals.csv",
      "daily-totals.csv",
      "export-summary.csv",
      "item-totals.csv"
    ]);
    expect(zip.readAsText("daily-totals.csv")).toContain("2026-05-01,1,120.00,30.00,10.00,100.00,60.00,40.00,0.00,0.00,100.00");
    expect(zip.readAsText("category-totals.csv")).toContain("2026-05-01,sg-food,Food,food,2,120.00,6.00,100.00");
    expect(zip.readAsText("item-totals.csv")).toContain("2026-05-01,item-dal-fry,Dal Fry,sg-food,Food,food,2,120.00");
    expect(zip.readAsText("bill-history.csv")).toContain('cash:60.00 | upi:40.00:UPI-1');
    expect(zip.readAsText("bill-items.csv")).toContain("2026-05-01,12,bill-export-1,oi-1,item-dal-fry,,Dal Fry,sg-food,2,60.00,120.00");

    database.close();
  });

  it("uses shared default Tally sale ledgers when settings have not been saved", () => {
    const { database, orderService } = createTestHub();
    insertDailySnapshot(database, {
      id: "day-export-tally-defaults",
      businessDate: "2026-05-02",
      billCount: 1,
      grossSalesPaise: 12_000,
      finalSalesPaise: 12_000,
      cashPaise: 12_000,
      groupSummaries: [
        { saleGroupId: "sg-food", name: "Food", kind: "food", quantity: 2, grossSalesPaise: 12_000, taxPaise: 600, finalSalesPaise: 12_000, ncQuantity: 0, ncGrossSalesPaise: 0 }
      ]
    });

    const xml = orderService.exportRangeTally({ from: "2026-05-02", to: "2026-05-02", includeBills: false }).body.toString("utf8");

    expect(xml).toContain("<LEDGERNAME>Sales - Food</LEDGERNAME>");
    expect(xml).not.toContain("<LEDGERNAME>Food Sales</LEDGERNAME>");

    database.close();
  });

  it("skips finalized zero-sale days in Tally XML instead of emitting empty vouchers", () => {
    const { database, orderService } = createTestHub();
    insertDailySnapshot(database, {
      id: "day-export-tally-zero",
      businessDate: "2026-05-02",
      billCount: 0,
      grossSalesPaise: 0,
      finalSalesPaise: 0,
      cashPaise: 0
    });
    insertDailySnapshot(database, {
      id: "day-export-tally-sales",
      businessDate: "2026-05-03",
      billCount: 1,
      grossSalesPaise: 12_000,
      finalSalesPaise: 12_000,
      cashPaise: 12_000,
      groupSummaries: [
        { saleGroupId: "sg-food", name: "Food", kind: "food", quantity: 2, grossSalesPaise: 12_000, taxPaise: 600, finalSalesPaise: 12_000, ncQuantity: 0, ncGrossSalesPaise: 0 }
      ]
    });

    const xml = orderService.exportRangeTally({ from: "2026-05-02", to: "2026-05-03", includeBills: false }).body.toString("utf8");

    expect(xml).not.toContain("<VOUCHERNUMBER>GPOS-20260502</VOUCHERNUMBER>");
    expect(xml).toContain("<VOUCHERNUMBER>GPOS-20260503</VOUCHERNUMBER>");
    expect(xml.match(/<VOUCHER /g)).toHaveLength(1);

    database.close();
  });

  it("downloads balanced TallyPrime XML vouchers with configured ledgers", () => {
    const { database, orderService } = createTestHub();
    orderService.updateTallyExportSettings({
      voucherTypeName: "Sales",
      cashLedgerName: "Cash in Hand",
      upiLedgerName: "UPI Clearing",
      cardLedgerName: "Card Clearing",
      onlineLedgerName: "Online Aggregator",
      discountLedgerName: "Discount Allowed",
      tipLedgerName: "Tips Collected",
      saleLedgerNames: { "sg-food": "Food Revenue" }
    });
    insertDailySnapshot(database, {
      id: "day-export-tally",
      businessDate: "2026-05-02",
      billCount: 1,
      grossSalesPaise: 12_000,
      discountPaise: 3_000,
      tipPaise: 1_000,
      finalSalesPaise: 10_000,
      cashPaise: 6_000,
      upiPaise: 4_000,
      groupSummaries: [
        { saleGroupId: "sg-food", name: "Food", kind: "food", quantity: 2, grossSalesPaise: 12_000, taxPaise: 600, finalSalesPaise: 10_000, ncQuantity: 0, ncGrossSalesPaise: 0 }
      ]
    });

    const xml = orderService.exportRangeTally({ from: "2026-05-02", to: "2026-05-02", includeBills: false }).body.toString("utf8");

    expect(xml).toContain("<TALLYREQUEST>Import</TALLYREQUEST>");
    expect(xml).toContain("<DATE>20260502</DATE>");
    expect(xml).toContain("<VOUCHERNUMBER>GPOS-20260502</VOUCHERNUMBER>");
    expect(xml).toContain("<LEDGERNAME>Cash in Hand</LEDGERNAME>");
    expect(xml).toContain("<AMOUNT>-60.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>UPI Clearing</LEDGERNAME>");
    expect(xml).toContain("<AMOUNT>-40.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Discount Allowed</LEDGERNAME>");
    expect(xml).toContain("<AMOUNT>-30.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Food Revenue</LEDGERNAME>");
    expect(xml).toContain("<AMOUNT>120.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Tips Collected</LEDGERNAME>");
    expect(xml).toContain("<AMOUNT>10.00</AMOUNT>");

    database.close();
  });

  it("blocks CSV and Tally exports until every selected date is finalized", () => {
    const { database, orderService } = createTestHub();
    insertDailySnapshot(database, { id: "day-export-ok", businessDate: "2026-05-01", billCount: 1, finalSalesPaise: 10_000, cashPaise: 10_000 });
    insertDailySnapshot(database, { id: "day-export-open", businessDate: "2026-05-02", billCount: 0, finalSalesPaise: 0, status: "active" });

    expect(() => orderService.exportRangeCsv({ from: "2026-05-01", to: "2026-05-03", includeBills: false })).toThrow("Export needs every selected date finalized");
    expect(() => orderService.exportRangeTally({ from: "2026-05-01", to: "2026-05-03", includeBills: false })).toThrow("Export needs every selected date finalized");

    database.close();
  });
});
