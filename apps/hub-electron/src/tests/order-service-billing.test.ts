import { describe, expect, it } from "vitest";
import { stripPrintStyleMarkers } from "../domain/tickets.js";
import { createTestHub } from "./helpers.js";

describe("OrderService billing and bill printing", () => {
  it("prints itemized dish lines on the customer bill", () => {
    const { database, orderService } = createTestHub();

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });
    const bill = orderService.generateBill(order.orderId);

    orderService.settleBill(bill.billId, {
      method: "cash",
      amountPaise: bill.totalPaise,
      receivedBy: "captain-1"
    });

    const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE target_id = ? AND target_type = 'BILL'").get(bill.billId) as { payload: string };
    expect(printJob.payload).toContain("Item");
    expect(printJob.payload).toContain("Amt");
    expect(printJob.payload).toContain("2 x Dal Fry");
    expect(printJob.payload).toContain("360.00");
    expect(printJob.payload).not.toContain("₹");

    database.close();
  });

  it("keeps itemized dish lines on manager-approved bill reprints", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);

    const reprint = orderService.reprintBill(bill.billId, {
      requestedBy: "captain-1",
      reason: "Customer copy",
      managerApproval: { pin: "1234", reason: "Customer copy", approvedBy: "manager" }
    });

    const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE id = ?").get(reprint.printJobId) as { payload: string };
    expect(printJob.payload).toContain("Item");
    expect(printJob.payload).toContain("Dal Fry");
    expect(printJob.payload).toContain("180.00");
    expect(printJob.payload).not.toContain("₹");
    expect(printJob.payload).toContain("REPRINT");
    expect(printJob.payload).toContain("Reason: Customer copy");

    database.close();
  });

  it("prints generated and reprinted bills with the latest saved discount amount", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });

    const bill = orderService.generateBill(order.orderId, "default", {
      discountType: "percent",
      discountValue: 10
    });

    const firstPrint = database.db.prepare("SELECT payload FROM print_jobs WHERE id = ?").get(bill.printJobId) as { payload: string };
    expect(stripPrintStyleMarkers(firstPrint.payload)).toContain("Discount              -36.00");
    expect(database.db.prepare("SELECT discount_paise, final_total_paise FROM bills WHERE id = ?").get(bill.billId)).toEqual({
      discount_paise: 3600,
      final_total_paise: 32400
    });
    expect(database.db.prepare("SELECT discount_paise, final_total_paise FROM bill_revisions WHERE bill_id = ? AND revision_number = 1").get(bill.billId)).toEqual({
      discount_paise: 3600,
      final_total_paise: 32400
    });

    const reprint = orderService.reprintBill(bill.billId, {
      requestedBy: "captain-1",
      reason: "Updated discount",
      managerApproval: { pin: "1234", reason: "Updated discount", approvedBy: "manager" },
      discountType: "amount",
      discountValue: 5000
    });

    const reprintJob = database.db.prepare("SELECT payload FROM print_jobs WHERE id = ?").get(reprint.printJobId) as { payload: string };
    expect(stripPrintStyleMarkers(reprintJob.payload)).toContain("Discount              -50.00");
    expect(database.db.prepare("SELECT discount_paise, final_total_paise FROM bills WHERE id = ?").get(bill.billId)).toEqual({
      discount_paise: 5000,
      final_total_paise: 31000
    });

    database.close();
  });

  it("does not let manager-approved reprints change paid bill financials", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      payments: [{ method: "cash", amountPaise: bill.totalPaise }]
    });

    expect(() =>
      orderService.reprintBill(bill.billId, {
        requestedBy: "captain-1",
        reason: "Late discount",
        managerApproval: { pin: "1234", reason: "Late discount", approvedBy: "manager" },
        discountType: "amount",
        discountValue: 5000
      })
    ).toThrow("Paid bill discounts can only be changed from Order History with Master PIN");
    expect(database.db.prepare("SELECT discount_paise, final_total_paise FROM bills WHERE id = ?").get(bill.billId)).toEqual({
      discount_paise: 0,
      final_total_paise: bill.totalPaise
    });

    database.close();
  });

  it("does not let pending bill adjustments fall below already recorded payments", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      payments: [{ method: "cash", amountPaise: 10_000 }]
    });

    expect(() =>
      orderService.reprintBill(bill.billId, {
        requestedBy: "captain-1",
        reason: "Too much discount",
        managerApproval: { pin: "1234", reason: "Too much discount", approvedBy: "manager" },
        discountType: "amount",
        discountValue: 30_000
      })
    ).toThrow("Recorded payments exceed adjusted bill total");
    expect(database.db.prepare("SELECT discount_paise, final_total_paise FROM bills WHERE id = ?").get(bill.billId)).toEqual({
      discount_paise: 0,
      final_total_paise: bill.totalPaise
    });

    database.close();
  });

  it("supports manual split payments with discount and tip", () => {
    const { database, orderService } = createTestHub();

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });

    const bill = orderService.generateBill(order.orderId);
    const partPaid = orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      discountType: "amount",
      discountValue: 1000,
      tipPaise: 500,
      payments: [
        { method: "cash", amountPaise: 10000 },
        { method: "online", amountPaise: 5000, reference: "manual-upi-note" }
      ]
    });

    expect(partPaid.status).toBe("pending");
    expect(partPaid.remainingPaise).toBeGreaterThan(0);

    const final = orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      payments: [{ method: "card", amountPaise: partPaid.remainingPaise }]
    });

    expect(final.status).toBe("paid");
    expect(database.db.prepare("SELECT status, discount_paise, tip_paise FROM bills WHERE id = ?").get(bill.billId)).toEqual({
      status: "paid",
      discount_paise: 1000,
      tip_paise: 500
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM payments WHERE bill_id = ?").get(bill.billId)).toEqual({ count: 3 });

    database.close();
  });

  it("allows explicit zero to clear bill discount and tip during settlement", () => {
    const { database, orderService } = createTestHub();
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
    });
    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      discountType: "amount",
      discountValue: 1000,
      tipPaise: 500,
      payments: [{ method: "cash", amountPaise: 1000 }]
    });
    const final = orderService.settleBill(bill.billId, {
      receivedBy: "captain-1",
      discountType: "amount",
      discountValue: 0,
      tipPaise: 0,
      payments: [{ method: "card", amountPaise: bill.totalPaise - 1000 }]
    });

    expect(final.status).toBe("paid");
    expect(database.db.prepare("SELECT discount_paise, tip_paise, final_total_paise FROM bills WHERE id = ?").get(bill.billId)).toEqual({
      discount_paise: 0,
      tip_paise: 0,
      final_total_paise: bill.totalPaise
    });

    database.close();
  });

  it("rejects overpayment instead of silently recording extra money", () => {
    const { database, orderService } = createTestHub();

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const bill = orderService.generateBill(order.orderId);

    expect(() =>
      orderService.settleBill(bill.billId, {
        receivedBy: "captain-1",
        payments: [{ method: "cash", amountPaise: bill.totalPaise + 1 }]
      })
    ).toThrow("Payment exceeds the balance due");
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM payments WHERE bill_id = ?").get(bill.billId)).toEqual({ count: 0 });

    database.close();
  });

  it("routes paid bill printing to the configured receipt printer", () => {
    const { database, orderService } = createTestHub();
    orderService.updateReceiptPrinter({
      printerMode: "network",
      printerHost: "192.168.1.70",
      printerPort: 9100
    });
    orderService.updatePrintLayout({
      ...orderService.getPrintLayout("receipt"),
      restaurantName: "Gaurav Restaurant",
      restaurantAddress: "Main Road, Indore",
      billHeader: "Tax Invoice",
      billFooter: "Thank you, visit again"
    });

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    const bill = orderService.generateBill(order.orderId);
    orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });
    expect(database.db.prepare("SELECT printer_host, printer_port FROM print_jobs WHERE target_id = ?").get(bill.billId)).toEqual({
      printer_host: "192.168.1.70",
      printer_port: 9100
    });
    const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE target_id = ? ORDER BY created_at ASC LIMIT 1").get(bill.billId) as { payload: string };
    expect(printJob.payload.indexOf("Gaurav Restaurant")).toBeLessThan(printJob.payload.indexOf("Main Road, Indore"));
    expect(printJob.payload).toContain("Main Road, Indore");
    expect(printJob.payload).toContain("Tax Invoice");
    expect(printJob.payload).toContain("Thank you, visit again");

    database.close();
  });

  it("routes bill print actions to the selected alternate bill printer without changing KOT routing", () => {
    const { database, orderService } = createTestHub();
    orderService.setManagerPin({ newPin: "1234", updatedBy: "admin" });
    orderService.updateBillPrinters({
      default: {
        label: "Main counter",
        printerMode: "network",
        printerHost: "192.168.1.70",
        printerPort: 9100
      },
      alternate: {
        label: "Downstairs",
        printerMode: "network",
        printerHost: "192.168.1.71",
        printerPort: 9100
      }
    });

    const printers = orderService.getBillPrinters();
    expect(printers.default).toMatchObject({ label: "Main counter", configured: true });
    expect(printers.alternate).toMatchObject({ label: "Downstairs", configured: true });

    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const kotPrint = database.db.prepare("SELECT printer_host FROM print_jobs WHERE target_type = 'KOT' ORDER BY created_at DESC LIMIT 1").get() as {
      printer_host: string;
    };
    expect(kotPrint.printer_host).not.toBe("192.168.1.71");

    const bill = orderService.generateBill(order.orderId, "alternate");
    expect(database.db.prepare("SELECT printer_host, printer_port FROM print_jobs WHERE id = ?").get(bill.printJobId)).toEqual({
      printer_host: "192.168.1.71",
      printer_port: 9100
    });

    const reprint = orderService.reprintBillFromHistory(bill.billId, "captain-1", "default");
    expect(database.db.prepare("SELECT printer_host, printer_port FROM print_jobs WHERE id = ?").get(reprint.printJobId)).toEqual({
      printer_host: "192.168.1.70",
      printer_port: 9100
    });

    const printCountBeforeSettle = database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs WHERE target_id = ?").get(bill.billId) as { count: number };
    const receiptPrintCountBeforeSettle = database.db.prepare("SELECT print_count FROM bills WHERE id = ?").get(bill.billId) as { print_count: number };
    const settlement = orderService.settleBill(bill.billId, { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" });
    expect(settlement.status).toBe("paid");
    expect(settlement).not.toHaveProperty("printJobId");
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs WHERE target_id = ?").get(bill.billId)).toEqual({ count: printCountBeforeSettle.count });
    expect(database.db.prepare("SELECT print_count FROM bills WHERE id = ?").get(bill.billId)).toEqual(receiptPrintCountBeforeSettle);

    const ncOrder = orderService.submitOrder({
      tableId: "table-t2",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });
    const ncBill = orderService.generateBill(ncOrder.orderId);
    const nc = orderService.markBillNc(ncBill.billId, {
      managerApproval: { pin: "1234", reason: "Staff meal", approvedBy: "manager" },
      printerSlot: "alternate"
    });
    expect(database.db.prepare("SELECT printer_host, printer_port FROM print_jobs WHERE id = ?").get(nc.printJobId)).toEqual({
      printer_host: "192.168.1.71",
      printer_port: 9100
    });

    database.close();
  });

  it("routes test bill printing to the selected alternate bill printer", () => {
    const { database, orderService } = createTestHub();
    orderService.updateBillPrinters({
      default: {
        label: "Main counter",
        printerMode: "network",
        printerHost: "192.168.1.70",
        printerPort: 9100
      },
      alternate: {
        label: "Downstairs",
        printerMode: "network",
        printerHost: "192.168.1.71",
        printerPort: 9100
      }
    });

    const testPrint = orderService.enqueueTestBillPrint("admin", "alternate");

    expect(database.db.prepare("SELECT printer_host, printer_port FROM print_jobs WHERE id = ?").get(testPrint.printJobId)).toEqual({
      printer_host: "192.168.1.71",
      printer_port: 9100
    });

    database.close();
  });

  it("rejects an incomplete alternate bill printer before creating the print job", () => {
    const { database, orderService } = createTestHub();
    orderService.updateBillPrinters({
      default: {
        label: "Main counter",
        printerMode: "network",
        printerHost: "192.168.1.70",
        printerPort: 9100
      },
      alternate: {
        label: "Downstairs",
        printerMode: "network",
        printerHost: "",
        printerPort: 9100
      }
    });
    const order = orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    });

    expect(() => orderService.generateBill(order.orderId, "alternate")).toThrow("Downstairs is not configured");
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM bills").get()).toEqual({ count: 0 });

    database.close();
  });
});
