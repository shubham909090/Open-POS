import { describe, expect, it } from "vitest";
import { calculateLineTotal, calculateTax, formatCompactInr, formatInr } from "../money.js";
import { getOrderStateSignature } from "../order-state-signature.js";
import { billPrintDestinationSchema, billPrinterProfileSchema, createMenuItemSchema, createPairingCodeSchema, markNcBillSchema, printLayoutSettingsSchema, reportRangeQuerySchema, setMasterPinSchema, submitOrderSchema, updateReceiptPrinterSchema } from "../schemas.js";
import { getTableDisplayState, isTransferTargetTable, tableDisplayClass, tableDisplayLabel } from "../table-state.js";

describe("shared money helpers", () => {
  it("calculates line totals, GST, and INR formatting", () => {
    expect(calculateLineTotal(12_500, 3)).toBe(37_500);
    expect(calculateTax(37_500, 500)).toBe(1_875);
    expect(formatInr(37_500)).toContain("375");
    expect(formatCompactInr(4_000)).toBe("₹40");
    expect(formatCompactInr(4_050)).toBe("₹40.50");
  });
});

describe("shared order state signature", () => {
  const saved = [
    { orderItemId: "oi-1", menuItemId: "item-1", menuItemVariantId: "v-30", pricePaise: 4_000, saleGroupId: "sg-alcohol", productionUnitId: "bar", quantity: 2 },
    { orderItemId: "oi-2", openName: "Open snack", pricePaise: 12_000, saleGroupId: "sg-food", productionUnitId: "kitchen", quantity: 1 }
  ];

  it("keeps unchanged and restored drafts stable", () => {
    const base = getOrderStateSignature(saved);
    expect(getOrderStateSignature([...saved].reverse())).toBe(base);
    expect(getOrderStateSignature([{ ...saved[0]!, quantity: 3 }, saved[1]!, { menuItemId: "item-new", quantity: 0 }])).not.toBe(base);
    expect(getOrderStateSignature(saved)).toBe(base);
  });

  it("marks quantity edits, existing removals, and real new items as dirty", () => {
    const base = getOrderStateSignature(saved);
    expect(getOrderStateSignature([{ ...saved[0]!, quantity: 3 }, saved[1]!])).not.toBe(base);
    expect(getOrderStateSignature([{ ...saved[0]!, note: "No onion" }, saved[1]!])).not.toBe(base);
    expect(getOrderStateSignature([{ ...saved[0]!, quantity: 0 }, saved[1]!])).not.toBe(base);
    expect(getOrderStateSignature([...saved, { menuItemId: "item-3", pricePaise: 5_000, saleGroupId: "sg-food", quantity: 1 }])).not.toBe(base);
  });

  it("ignores new lines reduced back to zero", () => {
    const base = getOrderStateSignature(saved);
    expect(getOrderStateSignature([...saved, { menuItemId: "item-3", pricePaise: 5_000, saleGroupId: "sg-food", quantity: 0 }])).toBe(base);
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
    expect(submitOrderSchema.parse({ ...input, note: "Less spicy for kitchen" }).note).toBe("Less spicy for kitchen");
    expect(submitOrderSchema.parse({ ...input, items: [{ menuItemId: "item-1", quantity: 1, note: "No onion" }] }).items[0]?.note).toBe("No onion");
    expect(submitOrderSchema.parse({ ...input, printMode: "kot" }).printMode).toBe("kot");
    expect(() => submitOrderSchema.parse({ ...input, printMode: "paperless" })).toThrow();
  });

  it("validates printer mode and rejects invalid pairing inputs", () => {
    expect(updateReceiptPrinterSchema.parse({ printerName: "EPSON_TM_T88", printerPort: 9100 })).toMatchObject({
      printerMode: "system"
    });
    expect(billPrinterProfileSchema.parse({ label: "Main bill", printerName: "EPSON_TM_T88" })).toMatchObject({
      label: "Main bill",
      printerMode: "system"
    });
    expect(billPrinterProfileSchema.parse({ label: "Second bill", printerMode: "network", printerHost: "192.168.1.70" })).toMatchObject({
      printerMode: "network",
      printerPort: 9100
    });
    expect(billPrintDestinationSchema.parse({}).printerSlot).toBe("default");
    expect(billPrintDestinationSchema.parse({ printerSlot: "alternate" }).printerSlot).toBe("alternate");
    expect(() => billPrintDestinationSchema.parse({ printerSlot: "kitchen" })).toThrow();
    expect(markNcBillSchema.parse({
      managerApproval: { pin: "1234", reason: "Staff meal", approvedBy: "manager" }
    }).printerSlot).toBe("default");
    expect(createPairingCodeSchema.parse({ deviceName: "Captain phone", role: "captain" })).toMatchObject({ role: "captain" });
    expect(() => createPairingCodeSchema.parse({ deviceName: "Old role", role: "cashier" })).toThrow();
    expect(() => createPairingCodeSchema.parse({ deviceName: "Phone", role: "owner" })).toThrow();
  });

  it("validates narrow receipt widths, section print styles, and changeable master PIN input", () => {
    expect(printLayoutSettingsSchema.parse({ scope: "receipt", restaurantAddress: "Main Road, Indore" }).restaurantAddress).toBe("Main Road, Indore");
    expect(printLayoutSettingsSchema.parse({ scope: "receipt", lineWidthChars: 25 }).lineWidthChars).toBe(25);
    expect(printLayoutSettingsSchema.parse({ scope: "receipt", lineWidthChars: 28 }).lineWidthChars).toBe(28);
    expect(printLayoutSettingsSchema.parse({ scope: "receipt", lineWidthChars: 32 }).lineWidthChars).toBe(32);
    expect(printLayoutSettingsSchema.parse({ scope: "receipt", lineWidthChars: 42 }).lineWidthChars).toBe(42);
    expect(printLayoutSettingsSchema.parse({ scope: "receipt", lineWidthChars: 48 }).lineWidthChars).toBe(48);
    expect(() => printLayoutSettingsSchema.parse({ scope: "receipt", lineWidthChars: 20 })).toThrow();
    const styled = printLayoutSettingsSchema.parse({
      scope: "receipt",
      topPaddingLines: 1,
      sectionStyles: {
        restaurantName: { size: "large", bold: true, align: "center" },
        totals: { size: "large", bold: true, align: "right" }
      }
    });
    expect(styled.topPaddingLines).toBe(1);
    expect(styled.sectionStyles.restaurantName).toEqual({ size: "large", bold: true, align: "center" });
    expect(styled.sectionStyles.totals).toEqual({ size: "large", bold: true, align: "right" });
    expect(styled.sectionStyles.itemNotes).toEqual({ size: "small", bold: false, align: "left" });
    expect(setMasterPinSchema.parse({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" })).toMatchObject({ newPin: "9876" });
    expect(setMasterPinSchema.parse({ currentPin: "9876", newPin: "1111", confirmPin: "1111", updatedBy: "owner" })).toMatchObject({ currentPin: "9876", newPin: "1111" });
    expect(() => setMasterPinSchema.parse({ newPin: "9876", confirmPin: "1111", updatedBy: "owner" })).toThrow();
  });

  it("requires a positive dish price", () => {
    expect(() => createMenuItemSchema.parse({ name: "Free Tea", pricePaise: 0 })).toThrow();
    expect(createMenuItemSchema.parse({ name: "Tea", pricePaise: 100 })).toMatchObject({ pricePaise: 100 });
  });

  it("accepts older finalized report ranges beyond one accounting year", () => {
    expect(reportRangeQuerySchema.parse({ from: "2024-04-01", to: "2026-06-29" })).toMatchObject({
      from: "2024-04-01",
      to: "2026-06-29",
      includeBills: false
    });
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

  it("allows transfer targets only when tables are free or running", () => {
    expect(isTransferTargetTable({ status: "free" })).toBe(true);
    expect(isTransferTargetTable({ status: "occupied" })).toBe(true);
    expect(isTransferTargetTable({ status: "billed" })).toBe(false);
    expect(isTransferTargetTable({ status: "attention" })).toBe(false);
    expect(isTransferTargetTable({ status: "occupied", active: false })).toBe(false);
  });
});
