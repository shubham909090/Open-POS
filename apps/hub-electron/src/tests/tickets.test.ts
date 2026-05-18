import { describe, expect, it } from "vitest";
import { parsePrintStyleLine, PRINT_LINE_MARKER, renderBillTicket, renderBillTicketForPrint, renderKotTicket, renderKotTicketForPrint, stripPrintStyleMarkers } from "../domain/tickets.js";

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
      restaurantAddress: "Main Road, Indore",
      header: "Tax Invoice",
      items: [{ name: "Paneer Tikka", quantity: 2, unitPricePaise: 22000, lineTotalPaise: 44000 }],
      subtotalPaise: 44000,
      taxPaise: 0,
      totalPaise: 44000,
      lineWidthChars: 42
    });

    expect(payload).toContain("__________________________________________");
    expect(payload).toContain("            Gaurav Restaurant");
    expect(payload).toContain("            Main Road, Indore");
    expect(payload).toContain("               Tax Invoice");
    expect(payload.indexOf("Gaurav Restaurant")).toBeLessThan(payload.indexOf("Main Road, Indore"));
    expect(payload.indexOf("Main Road, Indore")).toBeLessThan(payload.indexOf("Tax Invoice"));
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
      totalPaise: 30000,
      lineWidthChars: 28,
      taxBreakdown: [
        { name: "CGST", rateBps: 250, amountPaise: 750 },
        { name: "SGST", rateBps: 250, amountPaise: 750 }
      ]
    });
    const firstVisibleColumns = payload
      .split("\n")
      .filter((line) => line.includes("CGST") || line.includes("SGST"))
      .map((line) => line.slice(0, 32));

    expect(firstVisibleColumns).toEqual(["CGST @ 2.5%: 7.50", "SGST @ 2.5%: 7.50"]);
    expect(payload).toContain("Subtotal              300.00");
    expect(payload).toContain("Total                 300.00");
    expect(payload).not.toContain("VAT");
  });

  it("skips tax line when no tax components are configured", () => {
    const payload = renderBillTicket({
      tableName: "B1",
      billId: "12",
      createdAt: "2026-05-15T00:00:00.000Z",
      subtotalPaise: 4000,
      taxPaise: 0,
      totalPaise: 4000,
      taxBreakdown: [],
      lineWidthChars: 28
    });

    expect(payload).toContain("Subtotal               40.00");
    expect(payload).toContain("Total                  40.00");
    expect(payload).not.toContain("Tax");
    expect(payload).not.toContain("VAT");
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

  it("prints item-level kitchen notes on KOT/BOT tickets only", () => {
    const kot = renderKotTicket({
      sequence: 7,
      type: "new",
      tableName: "T3",
      productionUnitName: "Kitchen",
      ticketLabel: "KOT",
      captainId: "Captain",
      createdAt: "2026-07-12T07:00:00.000Z",
      items: [{ name: "Paneer Tikka", quantityDelta: 1, note: "No onion, serve fast" }],
      lineWidthChars: 28
    });
    const bill = renderBillTicket({
      tableName: "T3",
      billId: "9",
      createdAt: "2026-07-12T07:00:00.000Z",
      subtotalPaise: 26000,
      taxPaise: 0,
      totalPaise: 26000,
      items: [{ name: "Paneer Tikka", quantity: 1, unitPricePaise: 26000, lineTotalPaise: 26000 }]
    });

    expect(kot).toContain("No onion, serve fast");
    expect(bill).not.toContain("No onion");
  });

  it("styles item notes separately from item rows", () => {
    const payload = renderKotTicketForPrint({
      sequence: 7,
      type: "new",
      tableName: "T3",
      productionUnitName: "Kitchen",
      ticketLabel: "KOT",
      captainId: "Captain",
      createdAt: "2026-07-12T07:00:00.000Z",
      items: [{ name: "Paneer Tikka", quantityDelta: 1, note: "No onion" }],
      sectionStyles: {
        items: { size: "normal", bold: false, align: "left" },
        itemNotes: { size: "small", bold: false, align: "left" }
      },
      lineWidthChars: 28
    });
    const noteLine = payload.split(/\r?\n/).map((line) => parsePrintStyleLine(line)).find((line) => line?.plainText.includes("No onion"));

    expect(noteLine).toMatchObject({ size: "small", bold: false, align: "left" });
  });

  it("honors top padding and plain solid separators in preview text", () => {
    const payload = renderBillTicket({
      tableName: "T1",
      billId: "10",
      createdAt: "2026-05-17T12:35:00.000Z",
      restaurantName: "Gaurav Restaurant",
      subtotalPaise: 10000,
      taxPaise: 0,
      totalPaise: 10000,
      topPaddingLines: 2,
      lineWidthChars: 28
    });

    expect(payload.startsWith("\n\n")).toBe(true);
    expect(payload).toContain("____________________________");
    expect(payload).not.toContain("============================");
    expect(payload).not.toContain("----------------------------");
  });

  it("marks separators for graphic line drawing in styled print payloads", () => {
    const payload = renderBillTicketForPrint({
      tableName: "T1",
      billId: "10",
      createdAt: "2026-05-17T12:35:00.000Z",
      subtotalPaise: 10000,
      taxPaise: 0,
      totalPaise: 10000,
      lineWidthChars: 28
    });

    expect(payload).toContain(`${PRINT_LINE_MARKER}28`);
    expect(stripPrintStyleMarkers(payload)).toContain("____________________________");
  });

  it("uses section alignment settings in the actual ticket renderer", () => {
    const payload = renderBillTicket({
      tableName: "T1",
      billId: "10",
      createdAt: "2026-05-17T12:35:00.000Z",
      restaurantName: "Gaurav Restaurant",
      restaurantAddress: "Main Road",
      subtotalPaise: 10000,
      taxPaise: 0,
      totalPaise: 10000,
      lineWidthChars: 28,
      sectionStyles: {
        restaurantName: { size: "large", bold: true, align: "right" },
        address: { size: "normal", bold: false, align: "left" },
        title: { size: "normal", bold: true, align: "left" }
      }
    });

    const lines = payload.split("\n");
    expect(lines[0]).toBe("           Gaurav Restaurant");
    expect(lines[1]).toBe("Main Road");
    expect(lines[2]).toBe("BILL 10");
  });

  it("keeps styled print alignment raw while preserving padded text for plain system fallback", () => {
    const payload = renderBillTicketForPrint({
      tableName: "T1",
      billId: "10",
      createdAt: "2026-05-17T12:35:00.000Z",
      restaurantName: "Gaurav Restaurant",
      subtotalPaise: 10000,
      taxPaise: 0,
      totalPaise: 10000,
      lineWidthChars: 28,
      sectionStyles: {
        restaurantName: { size: "large", bold: true, align: "center" }
      }
    });
    const firstLine = payload.split("\n")[0] ?? "";
    const parsed = parsePrintStyleLine(firstLine);

    expect(parsed).toMatchObject({ text: "Gaurav Restaurant", plainText: "     Gaurav Restaurant", align: "center" });
    expect(stripPrintStyleMarkers(payload).split("\n")[0]).toBe("     Gaurav Restaurant");
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
