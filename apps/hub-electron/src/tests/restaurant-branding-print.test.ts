import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import QRCode from "qrcode";
import { compareNaturalNames, updateBillPrintersSchema } from "@gaurav-pos/shared";
import { prepareRestaurantLogo } from "../domain/order-service/restaurant-branding.js";
import { parsePrintStyleLine, PRINT_LOGO_MARKER, PRINT_QR_MARKER, PRINT_PAPER_MARKER } from "../domain/tickets.js";
import { logoBitmap, qrBitmap, ticketPaperDots } from "../printing/ticket-raster.js";
import { renderEscposPayload } from "../printing/escpos.js";
import { createTestServer, pairTestDevice, setTestManagerPin } from "./api-server-helpers.js";

const approval = { pin: "9876", reason: "Restaurant branding", approvedBy: "owner" };
const headers = { "x-device-token": "test-admin-token" };
const logo = async () => `data:image/png;base64,${(await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()).toString("base64")}`;
const opened: ReturnType<typeof createTestServer>[] = [];
afterEach(async () => { for (const server of opened.splice(0)) { await server.app.close(); server.database.close(); } });
async function setup() {
  const server = createTestServer(); opened.push(server);
  await setTestManagerPin(server.app);
  server.orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
  return server;
}

describe("restaurant branding and per-printer QR sizes", () => {
  it("keeps each printer QR size independent through generation, reprints and test bills, retaining legacy fallback", async () => {
    const { orderService: service, database } = await setup();
    await service.updatePaymentQr({ imageDataUrl: await QRCode.toDataURL("upi://pay?pa=restaurant@okaxis"), sizeMm: 35, masterApproval: approval }, "owner");
    expect(service.getBillPrinters().default.paymentQrSizeMm).toBe(35);
    const profiles = {
      default: { label: "Main", printerMode: "network" as const, printerHost: "192.0.2.10", printerPort: 9100, paymentQrSizeMm: 25 },
      alternate: { label: "Second", printerMode: "network" as const, printerHost: "192.0.2.11", printerPort: 9100, paymentQrSizeMm: 42 }
    };
    service.updateBillPrinters(profiles);
    const { paymentQrSizeMm: ignored, ...connection } = profiles.default;
    service.updateBillPrinters({ default: connection, alternate: profiles.alternate });
    expect(service.getBillPrinters().default.paymentQrSizeMm).toBe(25);
    const order = service.submitOrder({ tableId: "table-t1", captainId: "captain", pax: 1, orderType: "dine_in", items: [{ menuItemId: "item-dal-fry", quantity: 1 }] });
    const bill = service.generateBill(order.orderId, "alternate");
    const payload = (id: string) => (database.db.prepare("SELECT payload FROM print_jobs WHERE id=?").get(id) as { payload: string }).payload;
    expect(payload(bill.printJobId)).toContain(`${PRINT_QR_MARKER}42:`);
    service.setManagerPin({ newPin: "1234", updatedBy: "owner", currentPin: "1234" });
    const reprint = service.reprintBill(bill.billId, { requestedBy: "captain", reason: "copy", printerSlot: "default", managerApproval: { pin: "1234", approvedBy: "manager", reason: "copy" } });
    expect(payload(reprint.printJobId)).toContain(`${PRINT_QR_MARKER}25:`);
    expect(payload(service.enqueueTestBillPrint("owner", "alternate").printJobId)).toContain(`${PRINT_QR_MARKER}42:`);
    expect(updateBillPrintersSchema.safeParse({ ...profiles, default: { ...profiles.default, paymentQrSizeMm: 46 } }).success).toBe(false);
  });

  it("routes 58/80mm roll overrides into bill payloads without rewriting legacy receipt widths", async () => {
    const { orderService: service, database } = await setup();
    const legacy = { ...service.getPrintLayout("receipt"), lineWidthChars: 25 };
    service.updatePrintLayout(legacy);
    expect(service.getBillPrinters().default.paperWidthMm).toBeNull();
    const profiles = {
      default: { label: "58mm", printerMode: "network" as const, printerHost: "192.0.2.10", printerPort: 9100, paperWidthMm: 58 as const },
      alternate: { label: "80mm", printerMode: "network" as const, printerHost: "192.0.2.11", printerPort: 9100, paperWidthMm: 80 as const }
    };
    service.updateBillPrinters(profiles);
    const payload = (id: string) => (database.db.prepare("SELECT payload FROM print_jobs WHERE id=?").get(id) as { payload: string }).payload;
    const main = payload(service.enqueueTestBillPrint("owner", "default").printJobId);
    const alternate = payload(service.enqueueTestBillPrint("owner", "alternate").printJobId);
    expect(main).toContain(`${PRINT_PAPER_MARKER}32`);
    expect(alternate).toContain(`${PRINT_PAPER_MARKER}42`);
    expect(ticketPaperDots(main)).toBe(384);
    expect(ticketPaperDots(alternate)).toBe(576);
    expect(service.getPrintLayout("receipt")).toEqual(legacy);
    service.updateReceiptPrinter({ printerMode: "network", printerHost: "192.0.2.20", printerPort: 9100 });
    expect(service.getBillPrinters().default.paperWidthMm).toBe(58);
    const order = service.submitOrder({ tableId: "table-t1", captainId: "captain", pax: 1, orderType: "dine_in", items: [{ menuItemId: "item-dal-fry", quantity: 1 }] });
    const bill = service.generateBill(order.orderId, "alternate");
    expect(ticketPaperDots(payload(bill.printJobId))).toBe(576);
    const reprint = service.reprintBill(bill.billId, { requestedBy: "captain", reason: "copy", printerSlot: "default", managerApproval: { pin: "1234", approvedBy: "manager", reason: "copy" } });
    expect(ticketPaperDots(payload(reprint.printJobId))).toBe(384);
    await service.updatePaymentQr({ imageDataUrl: await QRCode.toDataURL("upi://pay?pa=restaurant@okaxis"), sizeMm: 45, masterApproval: approval }, "owner");
    service.updateBillPrinters({ ...profiles, default: { ...profiles.default, paperWidthMm: 45, paymentQrSizeMm: 45 } });
    const narrow = payload(service.enqueueTestBillPrint("owner", "default").printJobId);
    const qrLine = narrow.split("\n").map(parsePrintStyleLine).find(line => line?.qrImageDataUrl);
    const bitmap = qrBitmap(qrLine!, ticketPaperDots(narrow));
    expect(bitmap.width).toBe(320);
    expect(bitmap.height).toBeLessThanOrEqual(304);
    service.updateBillPrinters({ ...profiles, default: { ...profiles.default, paperWidthMm: null } });
    expect(service.getBillPrinters().default.paperWidthMm).toBeNull();
    expect(payload(service.enqueueTestBillPrint("owner", "default").printJobId)).toContain(`${PRINT_PAPER_MARKER}25`);
    expect(service.getPrintLayout("receipt")).toEqual(legacy);
    expect(updateBillPrintersSchema.safeParse({ ...profiles, default: { ...profiles.default, paperWidthMm: 72 } }).success).toBe(false);
  });

  it("requires Master approval, exposes branding to paired roles and normalizes logo uploads", async () => {
    const { app, orderService: service } = await setup();
    const imageDataUrl = await logo();
    expect((await app.inject({ method: "GET", url: "/settings/restaurant-branding" })).statusCode).toBe(401);
    expect((await app.inject({ method: "PUT", url: "/settings/restaurant-branding", headers, payload: { restaurantName: "Saffron", imageDataUrl } })).statusCode).toBe(403);
    const result = await app.inject({ method: "PUT", url: "/settings/restaurant-branding", headers, payload: { restaurantName: "Saffron", imageDataUrl, masterApproval: approval } });
    expect(result.statusCode).toBe(200);
    const branding = service.getRestaurantBranding();
    expect(branding.restaurantName).toBe("Saffron");
    expect(branding.logoImageDataUrl).toMatch(/^data:image\/png;base64,/);
    for (const role of ["captain", "waiter", "kitchen"] as const) {
      const { token } = await pairTestDevice(app, role, `${role} phone`);
      expect((await app.inject({ method: "GET", url: "/settings/restaurant-branding", headers: { "x-device-token": token } })).json()).toEqual({ branding });
      if (role !== "captain") expect((await app.inject({ method: "PUT", url: "/settings/restaurant-branding", headers: { "x-device-token": token }, payload: { restaurantName: "Wrong", masterApproval: approval } })).statusCode).toBe(403);
    }
    await expect(service.updateRestaurantBranding({ restaurantName: "Stale", masterApproval: approval, expectedUpdatedAt: null }, "owner")).rejects.toThrow("changed on another device");
    await service.updateRestaurantBranding({ restaurantName: "Saffron New", masterApproval: approval }, "owner");
    expect(service.getRestaurantBranding().logoImageDataUrl).toBe(branding.logoImageDataUrl);
    expect((await app.inject({ method: "DELETE", url: "/settings/restaurant-branding", headers, payload: { masterApproval: approval } })).statusCode).toBe(200);
    expect(service.getRestaurantBranding()).toMatchObject({ restaurantName: "Saffron New", logoImageDataUrl: null });
  });

  it("prints a centered logo before the bill heading, with safe raster sizing, and omits it from KOTs", async () => {
    const { orderService: service, database } = await setup();
    await service.updateRestaurantBranding({ restaurantName: "Saffron", imageDataUrl: await logo(), masterApproval: approval }, "owner");
    const order = service.submitOrder({ tableId: "table-t1", captainId: "captain", pax: 1, orderType: "dine_in", items: [{ menuItemId: "item-dal-fry", quantity: 1 }] });
    const bill = service.generateBill(order.orderId);
    const job = database.db.prepare("SELECT payload FROM print_jobs WHERE id=?").get(bill.printJobId) as { payload: string };
    expect(job.payload.indexOf(PRINT_LOGO_MARKER)).toBeLessThan(job.payload.indexOf("Saffron"));
    const parsed = job.payload.split("\n").map(parsePrintStyleLine).find(line => line?.logoImageDataUrl);
    expect(parsed).toBeTruthy();
    const bitmap = logoBitmap(parsed!, 320);
    expect(bitmap.width).toBe(320); expect(bitmap.height).toBeLessThanOrEqual(160);
    expect(bitmap.data[0]).toBe(255);
    expect(renderEscposPayload(job.payload).includes(Buffer.from([0x1d, 0x76, 0x30]))).toBe(true);
    service.enqueueTestKotPrint("owner");
    const jobs = database.db.prepare("SELECT payload FROM print_jobs WHERE target_type IN ('KOT','BOT')").all() as Array<{ payload: string }>;
    expect(jobs.length).toBeGreaterThan(0);
    for (const kot of jobs) expect(kot.payload).not.toContain(PRINT_LOGO_MARKER);
  });

  it("rejects non-images and oversized dimensions, and naturally orders names without mutating custom order", async () => {
    await expect(prepareRestaurantLogo("data:image/svg+xml;base64,PHN2Zz4=" )).rejects.toThrow("PNG or JPG");
    await expect(prepareRestaurantLogo("data:image/png;base64,aGVsbG8=" )).rejects.toThrow("could not be read");
    const huge = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
    await expect(prepareRestaurantLogo(`data:image/png;base64,${huge.toString("base64")}`)).rejects.toThrow("could not be read");
    expect(["T10", "T2", "A10", "A2"].sort(compareNaturalNames)).toEqual(["A2", "A10", "T2", "T10"]);
  });
});
