import { describe, expect, it } from "vitest";
import { calculateLineTotal, calculateTax, formatInr } from "../money.js";
import { createMenuItemSchema, createPairingCodeSchema, submitOrderSchema, updateReceiptPrinterSchema } from "../schemas.js";
import { getTableDisplayState, tableDisplayClass, tableDisplayLabel } from "../table-state.js";

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
      pax: 2,
      items: [{ menuItemId: "item-1", quantity: 1 }]
    });

    expect(input.orderType).toBe("dine_in");
    expect(input.printMode).toBe("kot_print");
    expect(submitOrderSchema.parse({ ...input, printMode: "kot" }).printMode).toBe("kot");
    expect(() => submitOrderSchema.parse({ ...input, printMode: "paperless" })).toThrow();
  });

  it("validates printer mode and rejects invalid pairing inputs", () => {
    expect(updateReceiptPrinterSchema.parse({ printerName: "EPSON_TM_T88", printerPort: 9100 })).toMatchObject({
      printerMode: "system"
    });
    expect(createPairingCodeSchema.parse({ deviceName: "Captain phone", role: "captain" })).toMatchObject({ role: "captain" });
    expect(() => createPairingCodeSchema.parse({ deviceName: "Old role", role: "cashier" })).toThrow();
    expect(() => createPairingCodeSchema.parse({ deviceName: "Phone", role: "owner" })).toThrow();
  });

  it("requires a positive dish price", () => {
    expect(() => createMenuItemSchema.parse({ name: "Free Tea", pricePaise: 0 })).toThrow();
    expect(createMenuItemSchema.parse({ name: "Tea", pricePaise: 100 })).toMatchObject({ pricePaise: 100 });
  });
});

describe("shared table display state", () => {
  it("maps operational table states to stable UI labels and classes", () => {
    expect(getTableDisplayState({ status: "free" })).toBe("free");
    expect(getTableDisplayState({ status: "occupied" })).toBe("running");
    expect(getTableDisplayState({ status: "billed" })).toBe("bill_printed");
    expect(getTableDisplayState({ status: "attention" })).toBe("needs_attention");
    expect(getTableDisplayState({ status: "occupied", active: false })).toBe("disabled");
    expect(tableDisplayLabel("bill_printed")).toBe("Bill printed");
    expect(tableDisplayClass("needs_attention")).toBe("needs-attention");
  });
});
