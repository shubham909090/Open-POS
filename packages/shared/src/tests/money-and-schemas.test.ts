import { describe, expect, it } from "vitest";
import { calculateLineTotal, calculateTax, formatInr } from "../money.js";
import { createPairingCodeSchema, submitOrderSchema, updateReceiptPrinterSchema } from "../schemas.js";

describe("shared money helpers", () => {
  it("calculates line totals, GST, and INR formatting", () => {
    expect(calculateLineTotal(12_500, 3)).toBe(37_500);
    expect(calculateTax(37_500, 500)).toBe(1_875);
    expect(formatInr(37_500)).toContain("375");
  });
});

describe("shared command schemas", () => {
  it("validates a waiter order command", () => {
    const input = submitOrderSchema.parse({
      tableId: "table-1",
      captainId: "waiter-1",
      pax: 2,
      items: [{ menuItemId: "item-1", quantity: 1 }]
    });

    expect(input.orderType).toBe("dine_in");
  });

  it("validates printer mode and rejects invalid pairing inputs", () => {
    expect(updateReceiptPrinterSchema.parse({ printerName: "EPSON_TM_T88", printerPort: 9100 })).toMatchObject({
      printerMode: "system"
    });
    expect(() => createPairingCodeSchema.parse({ deviceName: "Phone", role: "owner" })).toThrow();
  });
});
