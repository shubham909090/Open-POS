import { describe, expect, it } from "vitest";
import { renderBillTicket, renderKotTicket } from "../domain/tickets.js";

describe("ticket rendering", () => {
  it("keeps long itemized bill rows readable on thermal-width tickets", () => {
    const payload = renderBillTicket({
      tableName: "T1",
      billId: "BILL-1",
      createdAt: "2026-05-15T00:00:00.000Z",
      items: [
        {
          name: "Very Long Imported Single Malt Whisky",
          variantName: "750 ml",
          quantity: 2,
          unitPricePaise: 12_345,
          lineTotalPaise: 24_690
        }
      ],
      subtotalPaise: 24_690,
      taxPaise: 0,
      totalPaise: 24_690,
      lineWidthChars: 32
    });

    expect(payload).toMatch(/Item\s+Qty\s+Rate\s+Amt/);
    expect(payload).toContain("Very");
    expect(payload).toContain("Whisky");
    expect(payload).toContain("750 ml");
    expect(payload).toContain("123.45");
    expect(payload).toContain("246.90");
    expect(payload).not.toContain("₹");
  });

  it("uses wider centered layout for 80mm tickets", () => {
    const payload = renderBillTicket({
      tableName: "T1",
      billId: "BILL-1",
      createdAt: "2026-05-15T00:00:00.000Z",
      restaurantName: "Gaurav Restaurant",
      header: "Tax Invoice",
      items: [{ name: "Paneer Tikka", quantity: 2, unitPricePaise: 22000, lineTotalPaise: 44000 }],
      subtotalPaise: 44000,
      taxPaise: 0,
      totalPaise: 44000,
      lineWidthChars: 42
    });

    expect(payload).toContain("------------------------------------------");
    expect(payload).toContain("            Gaurav Restaurant");
    expect(payload).toContain("               Tax Invoice");
    expect(payload).toContain("Paneer Tikka");
    expect(payload).toContain("220.00");
    expect(payload).toContain("440.00");
  });

  it("keeps tax breakup names and values visible on narrow physical paper", () => {
    const payload = renderBillTicket({
      tableName: "T1",
      billId: "BILL-1",
      createdAt: "2026-05-15T00:00:00.000Z",
      subtotalPaise: 30000,
      taxPaise: 1500,
      totalPaise: 31500,
      lineWidthChars: 42,
      taxBreakdown: [
        { name: "Food CGST", rateBps: 250, amountPaise: 750 },
        { name: "Food SGST", rateBps: 250, amountPaise: 750 }
      ]
    });
    const firstVisibleColumns = payload
      .split("\n")
      .filter((line) => line.includes("CGST") || line.includes("SGST"))
      .map((line) => line.slice(0, 32));

    expect(firstVisibleColumns).toEqual(["Food CGST @ 2.5%: 7.50", "Food SGST @ 2.5%: 7.50"]);
  });

  it("can show or hide payment split lines", () => {
    const visible = renderBillTicket({
      tableName: "T1",
      billId: "BILL-1",
      createdAt: "2026-05-15T00:00:00.000Z",
      subtotalPaise: 50000,
      taxPaise: 0,
      totalPaise: 50000,
      payments: [
        { method: "cash", amountPaise: 30000 },
        { method: "upi", amountPaise: 20000 }
      ]
    });
    const hidden = renderBillTicket({
      tableName: "T1",
      billId: "BILL-1",
      createdAt: "2026-05-15T00:00:00.000Z",
      subtotalPaise: 50000,
      taxPaise: 0,
      totalPaise: 50000,
      payments: [{ method: "cash", amountPaise: 50000 }],
      showPaymentSplit: false
    });

    expect(visible).toContain("Payments");
    expect(visible).toContain("CASH");
    expect(visible).toContain("300.00");
    expect(visible).toContain("UPI");
    expect(visible).toContain("200.00");
    expect(hidden).not.toContain("Payments");
    expect(hidden).not.toContain("CASH");
  });

  it("prints operational KOT headings with readable time and compact shift context", () => {
    const payload = renderKotTicket({
      sequence: 4,
      type: "table_shifted",
      tableName: "T2",
      productionUnitName: "Bar",
      ticketLabel: "BOT",
      captainId: "Local Admin",
      createdAt: "2026-07-12T07:00:00.000Z",
      reason: "Items shifted from T1 because guest moved outside after a long service handoff",
      items: [{ name: "Whisky 30 ml", quantityDelta: 2 }],
      lineWidthChars: 42
    });

    expect(payload).toContain("BOT #4 TABLE SHIFTED");
    expect(payload).toContain("From T1");
    expect(payload).not.toContain("because guest moved outside");
    expect(payload).toContain("Station: Bar");
    expect(payload).toContain("Table: T2");
    expect(payload).toContain("Time:");
    expect(payload).toContain("+2 x Whisky 30 ml");
    expect(payload).not.toContain("Reason:");
    expect(payload).not.toContain("T00:");
  });

  it("prints compact bill item variants without default labels or duplicate volumes", async () => {
    const { renderBillTicket } = await import("../domain/tickets.js");

    const ticket = renderBillTicket({
      tableName: "T1",
      billId: "1",
      createdAt: "2026-05-17T12:35:00.000Z",
      subtotalPaise: 60000,
      taxPaise: 0,
      totalPaise: 60000,
      items: [
        { name: "Whisky 30 ml", variantName: "30 ml", quantity: 2, unitPricePaise: 30000, lineTotalPaise: 60000 },
        { name: "Dal Fry", variantName: "Regular", quantity: 1, unitPricePaise: 18000, lineTotalPaise: 18000 }
      ]
    });

    expect(ticket).toContain("Whisky 30 ml");
    expect(ticket).toContain("Dal Fry");
    expect(ticket).not.toContain("30 ml 30 ml");
    expect(ticket).not.toContain("Regular");
  });
});
