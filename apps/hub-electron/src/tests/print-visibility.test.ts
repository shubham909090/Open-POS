import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import QRCode from "qrcode";
import { printLayoutSettingsSchema } from "@gaurav-pos/shared";
import { readPrintLayout } from "../domain/order-service/settings-models.js";
import { PRINT_LOGO_MARKER, PRINT_QR_MARKER, renderBillTicketForPrint, stripPrintStyleMarkers } from "../domain/tickets.js";
import { createTestHub } from "./helpers.js";

const open: ReturnType<typeof createTestHub>[] = [];
afterEach(() => { for (const hub of open.splice(0)) hub.database.close(); });
const setup = () => { const hub = createTestHub(); open.push(hub); return hub; };
const createdAt = "2026-11-09T00:00:00.000Z";
const masterApproval = { pin: "9876", reason: "Test branding", approvedBy: "owner" };
const managerApproval = { pin: "1234", reason: "Test copy", approvedBy: "manager" };
const optionalBillFlags = {
  showRestaurantName: false, showRestaurantLogo: false, showPaymentQr: false,
  showRestaurantAddress: false, showTaxRegistration: false, showHeader: false,
  showFooter: false, showCustomerName: false,
};

describe("optional print sections", () => {
  it("defaults legacy layouts to visible without losing their contents or text sizing", () => {
    const legacy = { scope: "receipt", restaurantName: "Legacy restaurant", billFooter: "Saved footer", sectionStyles: { restaurantName: { size: "normal", sizeLevel: 0, bold: false, align: "left" } } };
    const parsed = printLayoutSettingsSchema.parse(legacy);
    for (const key of Object.keys(optionalBillFlags) as Array<keyof typeof optionalBillFlags>) expect(parsed[key]).toBe(true);
    expect(parsed.showOrderNote).toBe(true);
    expect(parsed.showItemNotes).toBe(true);
    const read = readPrintLayout((key) => key === "print_layout_receipt" ? JSON.stringify(legacy) : undefined, "receipt");
    expect(read.showRestaurantName).toBe(true);
    expect(read.restaurantName).toBe(legacy.restaurantName);
    expect(read.billFooter).toBe(legacy.billFooter);
    expect(read.sectionStyles.restaurantName.sizeLevel).toBe(0);
    expect(stripPrintStyleMarkers(renderBillTicketForPrint({ ...read, tableName: "T1", billId: "1", createdAt, subtotalPaise: 100, taxPaise: 0, totalPaise: 100 }))).toContain("Legacy restaurant");
  });

  it("independently hides bill branding, optional text and QR while preserving items and totals", () => {
    const common = {
      tableName: "T1", billId: "1", createdAt, subtotalPaise: 100, taxPaise: 0, totalPaise: 100,
      restaurantName: "Restaurant name", restaurantAddress: "Address text", taxRegistrationText: "GSTIN text",
      customerName: "Customer text", header: "Header text", footer: "Footer text",
      restaurantLogo: { imageDataUrl: "data:image/png;base64,LOGO" },
      paymentQr: { imageDataUrl: "data:image/png;base64,QR", upiUri: "upi://pay?pa=test@upi" },
      items: [{ name: "Dal fry", quantity: 1, unitPricePaise: 100, lineTotalPaise: 100 }],
    };
    const hidden = renderBillTicketForPrint({ ...common, ...optionalBillFlags });
    for (const text of ["Restaurant name", "Address text", "GSTIN text", "Customer text", "Header text", "Footer text", "Scan to pay", PRINT_LOGO_MARKER, PRINT_QR_MARKER]) expect(hidden).not.toContain(text);
    expect(stripPrintStyleMarkers(hidden)).toContain("Dal fry");
    expect(stripPrintStyleMarkers(hidden)).toContain("Total");
    const logoOnly = renderBillTicketForPrint({ ...common, ...optionalBillFlags, showRestaurantLogo: true });
    expect(logoOnly).toContain(PRINT_LOGO_MARKER);
    expect(logoOnly).not.toContain("Restaurant name");
    const nameOnly = renderBillTicketForPrint({ ...common, ...optionalBillFlags, showRestaurantName: true });
    expect(nameOnly).toContain("Restaurant name");
    expect(nameOnly).not.toContain(PRINT_LOGO_MARKER);
    const qrOnly = renderBillTicketForPrint({ ...common, ...optionalBillFlags, showPaymentQr: true });
    expect(qrOnly).toContain(PRINT_QR_MARKER);
    expect(qrOnly).not.toContain("Footer text");
  });

  it("carries hidden bill sections through real generation, reprints and test prints and restores saved content", async () => {
    const { orderService: service, database } = setup();
    service.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    service.setManagerPin({ newPin: "1234", updatedBy: "owner" });
    const imageDataUrl = `data:image/png;base64,${(await sharp({ create: { width: 80, height: 80, channels: 4, background: "black" } }).png().toBuffer()).toString("base64")}`;
    await service.updateRestaurantBranding({ restaurantName: "Shared restaurant", imageDataUrl, masterApproval }, "owner");
    await service.updatePaymentQr({ imageDataUrl: await QRCode.toDataURL("upi://pay?pa=test@upi"), sizeMm: 32, masterApproval }, "owner");
    const layout = { ...service.getPrintLayout("receipt"), ...optionalBillFlags, restaurantAddress: "Saved address", taxRegistrationText: "Saved GSTIN", billHeader: "Saved header", billFooter: "Saved footer" };
    service.updatePrintLayout(layout);
    const order = service.submitOrder({ tableId: "table-t1", captainId: "captain", pax: 1, orderType: "dine_in", items: [{ menuItemId: "item-dal-fry", quantity: 1 }] });
    const bill = service.generateBill(order.orderId, "default", { customerName: "Saved customer" });
    const read = (id: string) => (database.db.prepare("SELECT payload FROM print_jobs WHERE id=?").get(id) as { payload: string }).payload;
    const copy = service.reprintBill(bill.billId, { requestedBy: "captain", reason: "copy", managerApproval });
    for (const jobId of [bill.printJobId, copy.printJobId, service.enqueueTestBillPrint("owner").printJobId]) {
      const payload = read(jobId);
      for (const text of ["Shared restaurant", "Saved address", "Saved GSTIN", "Saved header", "Saved footer", "Saved customer", PRINT_LOGO_MARKER, PRINT_QR_MARKER]) expect(payload).not.toContain(text);
      expect(stripPrintStyleMarkers(payload)).toContain("Total");
    }
    expect(service.getPrintLayout("receipt")).toEqual(layout);
    service.updatePrintLayout({ ...layout, showRestaurantLogo: true });
    const restored = read(service.enqueueTestBillPrint("owner").printJobId);
    expect(restored).toContain(PRINT_LOGO_MARKER);
    expect(restored).not.toContain("Shared restaurant");
    expect(service.getRestaurantBranding().logoImageDataUrl).toBeTruthy();
    expect(service.getPaymentQr()).toBeTruthy();
  });

  it("preserves a legacy receipt-only restaurant name before shared branding is configured", () => {
    const { orderService: service, database } = setup();
    service.updatePrintLayout({ ...service.getPrintLayout("receipt"), restaurantName: "Legacy layout restaurant" });
    const read = (id: string) => (database.db.prepare("SELECT payload FROM print_jobs WHERE id=?").get(id) as { payload: string }).payload;
    const order = service.submitOrder({ tableId: "table-t1", captainId: "captain", pax: 1, orderType: "dine_in", items: [{ menuItemId: "item-dal-fry", quantity: 1 }] });
    const bill = service.generateBill(order.orderId);
    for (const id of [bill.printJobId, service.enqueueTestBillPrint("owner").printJobId]) expect(read(id)).toContain("Legacy layout restaurant");
  });

  it("keeps an explicitly blank shared restaurant name blank instead of reviving the legacy name", async () => {
    const { orderService: service, database } = setup();
    service.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    service.updatePrintLayout({ ...service.getPrintLayout("receipt"), restaurantName: "Old name" });
    await service.updateRestaurantBranding({ restaurantName: "", masterApproval }, "owner");
    const job = service.enqueueTestBillPrint("owner");
    expect((database.db.prepare("SELECT payload FROM print_jobs WHERE id=?").get(job.printJobId) as { payload: string }).payload).not.toContain("Old name");
  });

  it("honors kitchen header, footer and note visibility on original, reprint and test tickets", () => {
    const { orderService: service, database } = setup();
    const layout = { ...service.getPrintLayout("unit", "unit-kitchen"), showHeader: false, showFooter: false, showOrderNote: false, showItemNotes: false, kotHeader: "Saved kitchen header", kotFooter: "Saved kitchen footer" };
    service.updatePrintLayout(layout);
    const order = service.submitOrder({ tableId: "table-t1", captainId: "captain", pax: 1, orderType: "dine_in", note: "Saved order note", items: [{ menuItemId: "item-dal-fry", quantity: 1, note: "Saved dish note" }] });
    const read = (id: string) => (database.db.prepare("SELECT payload FROM print_jobs WHERE id=?").get(id) as { payload: string }).payload;
    const copy = service.reprintKot(order.kotIds[0]!, { requestedBy: "captain", reason: "copy" });
    for (const jobId of [...order.printJobIds, copy.printJobId, service.enqueueTestKotPrint("owner").printJobId]) {
      const payload = read(jobId);
      for (const text of ["Saved kitchen header", "Saved kitchen footer", "Saved order note", "Saved dish note", PRINT_LOGO_MARKER, PRINT_QR_MARKER]) expect(payload).not.toContain(text);
      expect(stripPrintStyleMarkers(payload)).toContain("Station:");
    }
    service.updatePrintLayout({ ...layout, showOrderNote: true, showItemNotes: true, showHeader: true, showFooter: true });
    const restored = read(service.reprintKot(order.kotIds[0]!, { requestedBy: "captain", reason: "copy" }).printJobId);
    for (const text of ["Saved kitchen header", "Saved kitchen footer", "Saved order note", "Saved dish note"]) expect(restored).toContain(text);
  });
});
