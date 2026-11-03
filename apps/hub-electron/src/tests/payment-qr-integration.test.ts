import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { HubDatabase } from "../db/database.js";
import { OrderService } from "../domain/order-service.js";
import { parsePrintStyleLine, PRINT_QR_MARKER } from "../domain/tickets.js";
import { realtimeEventForRole } from "../api/realtime-visibility.js";
import { getRealtimeInvalidationKeys } from "../renderer/realtime.js";
import { createTestHub } from "./helpers.js";

const masterApproval = { pin: "9876", reason: "Change payment destination", approvedBy: "owner" };
const qrImage = (id: string) => QRCode.toDataURL(`upi://pay?pa=${id}@okaxis&pn=Restaurant`);

describe("payment QR receipt integration and compatibility", () => {
  it("uses the current shared QR on both bill printers, above the footer, and never on KOTs", async () => {
    const { database, orderService: service } = createTestHub();
    try {
      service.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
      service.setManagerPin({ newPin: "1234", updatedBy: "owner" });
      service.updateBillPrinters({
        default: { label: "Main", printerMode: "network", printerHost: "192.0.2.10", printerPort: 9100 },
        alternate: { label: "Second", printerMode: "network", printerHost: "192.0.2.11", printerPort: 9100 },
      });
      service.updatePrintLayout({ ...service.getPrintLayout("receipt"), billFooter: "Please visit again" });
      const first = await service.updatePaymentQr({ imageDataUrl: await qrImage("first"), sizeMm: 32, masterApproval }, "owner");
      const order = service.submitOrder({ tableId: "table-t1", captainId: "waiter-1", pax: 1, orderType: "dine_in", items: [{ menuItemId: "item-dal-fry", quantity: 1 }] });
      const bill = service.generateBill(order.orderId);
      const payload = (id: string) => (database.db.prepare("SELECT payload FROM print_jobs WHERE id = ?").get(id) as { payload: string }).payload;
      const firstPayload = payload(bill.printJobId);
      expect(firstPayload).toContain(first.qr.imageDataUrl);
      expect(firstPayload.indexOf(PRINT_QR_MARKER)).toBeLessThan(firstPayload.indexOf("Please visit again"));
      const changed = await service.updatePaymentQr({ imageDataUrl: await qrImage("second"), sizeMm: 40, masterApproval }, "owner");
      await expect(service.updatePaymentQr({ imageDataUrl: first.qr.imageDataUrl, sizeMm: 35, masterApproval, expectedUpdatedAt: first.qr.updatedAt }, "owner")).rejects.toThrow("Payment QR changed on another device");
      expect(service.getPaymentQr()?.upiId).toBe("second@okaxis");
      expect(() => service.removePaymentQr({ masterApproval, expectedUpdatedAt: first.qr.updatedAt }, "owner")).toThrow("Payment QR changed on another device");
      const reprint = (printerSlot: "default" | "alternate") => service.reprintBill(bill.billId, { requestedBy: "captain", reason: "Customer copy", printerSlot, managerApproval: { pin: "1234", reason: "Customer copy", approvedBy: "manager" } });
      const alternatePrint = reprint("alternate");
      expect(payload(alternatePrint.printJobId)).toContain(changed.qr.imageDataUrl);
      expect(payload(alternatePrint.printJobId)).not.toContain(first.qr.imageDataUrl);
      expect(payload(bill.printJobId)).toBe(firstPayload);
      const testBill = service.enqueueTestBillPrint("captain");
      expect(payload(testBill.printJobId)).toContain(changed.qr.imageDataUrl);
      service.enqueueTestKotPrint("captain");
      const kitchenJobs = database.db.prepare("SELECT payload FROM print_jobs WHERE target_type IN ('KOT','BOT')").all() as Array<{ payload: string }>;
      expect(kitchenJobs.length).toBeGreaterThan(0);
      for (const job of kitchenJobs) expect(job.payload).not.toContain(PRINT_QR_MARKER);
      service.removePaymentQr({ masterApproval }, "owner");
      expect(payload(reprint("default").printJobId)).not.toContain(PRINT_QR_MARKER);
    } finally { database.close(); }
  });

  it("opens an existing database without changing legacy layouts, orders, or the database schema", async () => {
    const root = mkdtempSync(join(tmpdir(), "payment-qr-compat-"));
    const file = join(root, "hub.sqlite");
    let database = new HubDatabase(file);
    try {
      database.migrate();
      database.seedDemoData();
      let service = new OrderService(database.orm);
      const legacyLayout = { ...service.getPrintLayout("receipt"), billFooter: "Visit again", sectionStyles: { ...service.getPrintLayout("receipt").sectionStyles, totals: { size: "large" as const, bold: true, align: "right" as const } } };
      database.db.prepare("INSERT INTO hub_settings (key,value,updated_at) VALUES ('print_layout_receipt',?,?)").run(JSON.stringify(legacyLayout), new Date().toISOString());
      const order = service.submitOrder({ tableId: "table-t1", captainId: "captain", pax: 2, orderType: "dine_in", items: [{ menuItemId: "item-dal-fry", quantity: 2 }] });
      const schema = database.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
      database.close();
      database = new HubDatabase(file);
      database.migrate();
      service = new OrderService(database.orm);
      expect(service.getPaymentQr()).toBeNull();
      expect(service.getPrintLayout("receipt")).toEqual(legacyLayout);
      service.setMasterPin({ newPin: "9876", confirmPin: "9876", updatedBy: "owner" });
      await service.updatePaymentQr({ imageDataUrl: await qrImage("restaurant"), sizeMm: 32, masterApproval }, "owner");
      const bill = service.generateBill(order.orderId);
      const job = database.db.prepare("SELECT payload FROM print_jobs WHERE id = ?").get(bill.printJobId) as { payload: string };
      const totalLine = job.payload.split("\n").map(parsePrintStyleLine).find((line) => line?.text.includes("Total"));
      expect(totalLine).toMatchObject({ size: "large", bold: true, align: "right" });
      expect(totalLine?.sizeLevel).toBeUndefined();
      expect(service.getPrintLayout("receipt")).toEqual(legacyLayout);
      expect(database.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all()).toEqual(schema);
      database.close();
      database = new HubDatabase(file);
      expect(new OrderService(database.orm).getPaymentQr()?.upiId).toBe("restaurant@okaxis");
    } finally { database.close(); rmSync(root, { recursive: true, force: true }); }
  });

  it("notifies every staff role without exposing setting details and refreshes the hub preview", () => {
    for (const role of ["waiter", "kitchen", "captain", "admin"] as const) {
      expect(realtimeEventForRole({ type: "payment_qr.updated", result: { private: true } }, role)).toBeTruthy();
    }
    expect(realtimeEventForRole({ type: "payment_qr.updated", result: { private: true } }, "waiter")).toEqual({ type: "payment_qr.updated" });
    expect(realtimeEventForRole({ type: "payment_qr.updated", result: { private: true } }, "kitchen")).toEqual({ type: "payment_qr.updated" });
    expect(getRealtimeInvalidationKeys({ type: "payment_qr.updated" })).toEqual([["payment-qr"]]);
  });
});
