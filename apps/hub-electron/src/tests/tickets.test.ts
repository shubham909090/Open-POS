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
      totalPaise: 24_690
    });

    expect(payload).toContain("Item  Qty  Rate  Amt");
    expect(payload).toContain("Very Long Imported Single Mal...");
    expect(payload).toContain("2 x ₹123.45 = ₹246.90");
  });
});
