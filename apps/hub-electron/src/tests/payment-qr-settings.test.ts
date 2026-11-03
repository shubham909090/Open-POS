import { afterEach, describe, expect, it } from "vitest";
import QRCode from "qrcode";
import sharp from "sharp";
import { PAYMENT_QR_MAX_IMAGE_BYTES, paymentQrSchema, updatePaymentQrSchema, type PaymentQr } from "@gaurav-pos/shared";
import { preparePaymentQr } from "../domain/order-service/payment-qr-settings.js";
import { createTestServer, pairTestDevice, setTestManagerPin } from "./api-server-helpers.js";

const masterApproval = { pin: "9876", reason: "Update payment QR", approvedBy: "owner" };
const adminHeaders = { "x-device-token": "test-admin-token" };
const firstUri = "upi://pay?pa=restaurant@okaxis&pn=Gaurav%20Restaurant&mc=5812&mode=02&sign=merchant-signature";
const secondUri = "upi://pay?pa=restaurant2@okhdfcbank&pn=Gaurav%20Restaurant";
const imageFor = (uri: string) => QRCode.toDataURL(uri, { margin: 4, scale: 6 });

describe("shared payment QR settings", () => {
  const opened: ReturnType<typeof createTestServer>[] = [];
  afterEach(async () => {
    for (const server of opened.splice(0)) {
      await server.app.close();
      server.database.close();
    }
  });

  async function setup() {
    const server = createTestServer();
    opened.push(server);
    await setTestManagerPin(server.app);
    server.orderService.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
    return server;
  }

  it("defaults old QR sizes to 32mm and validates the adjustable 20–45mm range", () => {
    expect(paymentQrSchema.parse({ imageDataUrl: "image", upiUri: firstUri, upiId: "restaurant@okaxis", payeeName: "Restaurant", updatedAt: new Date().toISOString() }).sizeMm).toBe(32);
    expect(updatePaymentQrSchema.parse({ imageDataUrl: "image" }).sizeMm).toBe(32);
    for (const sizeMm of [20, 32, 45]) expect(updatePaymentQrSchema.parse({ imageDataUrl: "image", sizeMm }).sizeMm).toBe(sizeMm);
    for (const sizeMm of [0, 19, 46, 25.5]) expect(updatePaymentQrSchema.safeParse({ imageDataUrl: "image", sizeMm }).success).toBe(false);
  });

  it("lets every paired role read the same current QR without a PIN and rejects anonymous reads", async () => {
    const { app } = await setup();
    const empty = await app.inject({ method: "GET", url: "/settings/payment-qr", headers: adminHeaders });
    expect(empty.json()).toEqual({ qr: null });
    const upload = await app.inject({ method: "PUT", url: "/settings/payment-qr", headers: adminHeaders, payload: { imageDataUrl: await imageFor(firstUri), masterApproval } });
    expect(upload.statusCode).toBe(200);
    const qr = upload.json<{ qr: PaymentQr }>().qr;
    expect(qr).toMatchObject({ upiUri: firstUri, upiId: "restaurant@okaxis", payeeName: "Gaurav Restaurant" });
    expect(qr.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    for (const role of ["captain", "waiter", "kitchen"] as const) {
      const { token } = await pairTestDevice(app, role, `${role} phone`);
      const response = await app.inject({ method: "GET", url: "/settings/payment-qr", headers: { "x-device-token": token } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toEqual({ qr });
    }
    expect((await app.inject({ method: "GET", url: "/settings/payment-qr" })).statusCode).toBe(401);
  });

  it("requires the master PIN for upload, replacement and removal, allowing captain management only with approval", async () => {
    const { app, orderService, database } = await setup();
    const imageDataUrl = await imageFor(firstUri);
    const noPin = await app.inject({ method: "PUT", url: "/settings/payment-qr", headers: adminHeaders, payload: { imageDataUrl } });
    expect(noPin.statusCode).toBe(403);
    expect(noPin.json()).toEqual({ error: "Master PIN is required for this action" });
    const managerPin = await app.inject({ method: "PUT", url: "/settings/payment-qr", headers: adminHeaders, payload: { imageDataUrl, masterApproval: { ...masterApproval, pin: "1234" } } });
    expect(managerPin.statusCode).toBe(403);
    expect(managerPin.json()).toEqual({ error: "Master PIN is incorrect" });
    expect(orderService.getPaymentQr()).toBeNull();

    const { token: captainToken } = await pairTestDevice(app, "captain", "Captain tablet");
    const captainHeaders = { "x-device-token": captainToken };
    expect((await app.inject({ method: "PUT", url: "/settings/payment-qr", headers: captainHeaders, payload: { imageDataUrl, masterApproval } })).statusCode).toBe(200);
    const first = orderService.getPaymentQr();
    expect((await app.inject({ method: "PUT", url: "/settings/payment-qr", headers: captainHeaders, payload: { imageDataUrl: await imageFor(secondUri) } })).statusCode).toBe(403);
    expect(orderService.getPaymentQr()).toEqual(first);
    const replace = await app.inject({ method: "PUT", url: "/settings/payment-qr", headers: captainHeaders, payload: { imageDataUrl: await imageFor(secondUri), sizeMm: 40, masterApproval } });
    expect(replace.statusCode).toBe(200);
    expect(orderService.getPaymentQr()?.upiUri).toBe(secondUri);
    expect(orderService.getPaymentQr()?.sizeMm).toBe(40);
    expect((await app.inject({ method: "DELETE", url: "/settings/payment-qr", headers: captainHeaders, payload: {} })).statusCode).toBe(403);
    expect(orderService.getPaymentQr()?.upiUri).toBe(secondUri);
    const remove = await app.inject({ method: "DELETE", url: "/settings/payment-qr", headers: captainHeaders, payload: { masterApproval } });
    expect(remove.statusCode).toBe(200);
    expect(remove.json()).toEqual({ qr: null });
    expect(orderService.getPaymentQr()).toBeNull();
    const audits = database.db.prepare("SELECT requested_by, action FROM manager_approvals WHERE action LIKE 'payment_qr.%'").all();
    expect(audits).toEqual([
      { requested_by: "Captain tablet", action: "payment_qr.updated" },
      { requested_by: "Captain tablet", action: "payment_qr.updated" },
      { requested_by: "Captain tablet", action: "payment_qr.removed" }
    ]);
    const events = database.db.prepare("SELECT payload FROM event_log WHERE type = 'payment_qr.updated'").all() as Array<{ payload: string }>;
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event.payload).not.toContain("base64");
      expect(event.payload).not.toContain("9876");
      expect(event.payload).not.toContain("upi://");
    }
  });

  it("never lets waiter or kitchen roles change the QR even with the master PIN", async () => {
    const { app } = await setup();
    const imageDataUrl = await imageFor(firstUri);
    for (const role of ["waiter", "kitchen"] as const) {
      const { token } = await pairTestDevice(app, role, `${role} phone`);
      const headers = { "x-device-token": token };
      expect((await app.inject({ method: "PUT", url: "/settings/payment-qr", headers, payload: { imageDataUrl, masterApproval } })).statusCode).toBe(403);
      expect((await app.inject({ method: "DELETE", url: "/settings/payment-qr", headers, payload: { masterApproval } })).statusCode).toBe(403);
    }
  });

  it("accepts JPG uploads and regenerates the exact UPI payload as a clean PNG", async () => {
    const png = Buffer.from((await imageFor(firstUri)).split(",")[1]!, "base64");
    const jpeg = await sharp(png).jpeg({ quality: 95 }).toBuffer();
    const qr = await preparePaymentQr(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
    expect(qr.upiUri).toBe(firstUri);
    expect(qr.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect((await preparePaymentQr(qr.imageDataUrl)).upiUri).toBe(firstUri);
  });

  it("rejects nonpayment, fixed-amount, corrupt, blank and oversized uploads without replacing the current QR", async () => {
    const { app, orderService } = await setup();
    await orderService.updatePaymentQr({ imageDataUrl: await imageFor(firstUri), sizeMm: 32, masterApproval }, "owner");
    const current = orderService.getPaymentQr();
    const blank = await sharp({ create: { width: 200, height: 200, channels: 3, background: "white" } }).png().toBuffer();
    for (const imageDataUrl of [
      await imageFor("https://example.com"),
      await imageFor("upi://pay?pa=not-a-upi-id"),
      await imageFor("upi://pay?pa=restaurant@okaxis&am=100.00"),
      await QRCode.toDataURL(`upi://pay?pa=restaurant@okaxis&sign=${"X".repeat(3500)}`, { errorCorrectionLevel: "L", scale: 6, margin: 4 }),
      "data:image/png;base64,AAAA",
      `data:image/png;base64,${blank.toString("base64")}`,
      `data:image/png;base64,${Buffer.alloc(PAYMENT_QR_MAX_IMAGE_BYTES + 1).toString("base64")}`
    ]) {
      const response = await app.inject({ method: "PUT", url: "/settings/payment-qr", headers: adminHeaders, payload: { imageDataUrl, masterApproval } });
      expect(response.statusCode).toBe(400);
      expect(orderService.getPaymentQr()).toEqual(current);
    }
    await expect(preparePaymentQr(await imageFor("upi://pay?pa=restaurant@okaxis&am=100.00"))).rejects.toThrow("Upload a reusable payment QR without a fixed amount.");
    expect((await preparePaymentQr(await imageFor("upi://pay?pa=restaurant@okaxis&am=0.00"))).upiUri).toContain("am=0.00");
  });
});
