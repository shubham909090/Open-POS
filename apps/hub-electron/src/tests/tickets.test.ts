import { describe, expect, it } from "vitest";
import { renderBillTicket } from "../domain/tickets.js";

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

    expect(payload).toContain("Item  Qty  Rate  Amt");
    expect(payload).toContain("Very Long Imported Single Mal...");
    expect(payload).toContain("2 x ₹123.45 = ₹246.90");
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
    expect(payload).toContain("Paneer Tikka         2 x ₹220.00 = ₹440.00");
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
    expect(visible).toContain("CASH: ₹300.00");
    expect(visible).toContain("UPI: ₹200.00");
    expect(hidden).not.toContain("Payments");
    expect(hidden).not.toContain("CASH: ₹500.00");
  });
});
