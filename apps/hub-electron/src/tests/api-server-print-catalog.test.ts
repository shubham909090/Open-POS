import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createHubServer, isRealtimeEventVisibleForRole, realtimeEventForRole, resolvePairingHubUrl, selectPairingLanAddress } from "../api/server.js";
import { BackupService } from "../db/backup-service.js";
import { cloudCommandFailures, idempotencyRecords } from "../db/drizzle-schema.js";
import { EventBus } from "../domain/event-bus.js";
import { DryRunPrinterAdapter } from "../printing/escpos.js";
import { PrintJobService } from "../printing/print-job-service.js";
import { ConvexSyncBridge } from "../sync/convex-sync.js";
import { createTestHub } from "./helpers.js";
import {
  createFailingPrintTestServer,
  createFileBackedTestServer,
  createTestServer,
  expectNoSocketMessage,
  insertApiDailySnapshot,
  listenForWebSockets,
  pairTestDevice,
  pairingPayload,
  setTestManagerPin,
  testManagerApproval,
  waitForSocketClose,
  waitForSocketMessage,
  waitForSocketOpen
} from "./api-server-helpers.js";

describe("Hub API print, catalog, and report routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies cash-counter and kitchen-specific print layouts to test tickets", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token", "x-manager-pin": "1234" };
    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      headers: { "x-device-token": "test-admin-token" },
      payload: { newPin: "1234", updatedBy: "admin" }
    });

    const receiptLayout = await app.inject({
      method: "PUT",
      url: "/print-layouts/receipt",
      headers,
      payload: {
        scope: "receipt",
        restaurantName: "Sky Bistro",
        restaurantAddress: "MG Road, Indore",
        billHeader: "TAX INVOICE",
        billFooter: "Thank you",
        kotHeader: "",
        kotFooter: "",
        taxRegistrationText: "GSTIN TEST",
        lineWidthChars: 32,
        headerAlign: "left",
        footerAlign: "center",
        feedLines: 2,
        showTable: false,
        showCaptain: true,
        showDateTime: true,
        showBillId: true,
        showTaxBreakup: true,
        showPaymentSplit: true,
        showDiscountTip: true,
        showNcReprintRevision: true
      }
    });
    const unitLayout = await app.inject({
      method: "PUT",
      url: "/print-layouts/unit",
      headers,
      payload: {
        scope: "unit",
        productionUnitId: "unit-bar",
        restaurantName: "",
        restaurantAddress: "",
        billHeader: "",
        billFooter: "",
        kotHeader: "HOT KITCHEN",
        kotFooter: "Cook fast",
        taxRegistrationText: "",
        lineWidthChars: 32,
        headerAlign: "left",
        footerAlign: "left",
        feedLines: 2,
        showTable: true,
        showCaptain: false,
        showDateTime: false,
        showBillId: true,
        showTaxBreakup: true,
        showPaymentSplit: true,
        showDiscountTip: true,
        showNcReprintRevision: true
      }
    });
    await app.inject({ method: "POST", url: "/print-jobs/test-bill", headers: { "x-device-token": "test-admin-token" } });
    await app.inject({ method: "POST", url: "/print-jobs/test-kot", headers: { "x-device-token": "test-admin-token" } });

    const billPayload = database.db.prepare("SELECT payload FROM print_jobs WHERE target_id = 'test-bill' ORDER BY created_at DESC LIMIT 1").get() as { payload: string };
    const kotPayload = database.db.prepare("SELECT payload FROM print_jobs WHERE target_id = 'test-kot' ORDER BY created_at DESC LIMIT 1").get() as { payload: string };
    expect(receiptLayout.statusCode).toBe(200);
    expect(unitLayout.statusCode).toBe(200);
    expect(billPayload.payload).toContain("Sky Bistro");
    expect(billPayload.payload).toContain("MG Road, Indore");
    expect(billPayload.payload.indexOf("Sky Bistro")).toBeLessThan(billPayload.payload.indexOf("MG Road, Indore"));
    expect(billPayload.payload).toContain("TAX INVOICE");
    expect(billPayload.payload).not.toContain("Table: TEST");
    expect(kotPayload.payload).toContain("HOT KITCHEN");
    expect(kotPayload.payload).not.toContain("Captain:");

    await app.close();
    database.close();
  });

  it("routes alternate test bill prints through the API to the alternate bill printer", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    await app.inject({
      method: "PUT",
      url: "/settings/bill-printers",
      headers,
      payload: {
        default: { label: "Main counter", printerMode: "network", printerHost: "192.168.1.70", printerPort: 9100 },
        alternate: { label: "Downstairs", printerMode: "network", printerHost: "192.168.1.71", printerPort: 9100 }
      }
    });
    const response = await app.inject({
      method: "POST",
      url: "/print-jobs/test-bill",
      headers,
      payload: { printerSlot: "alternate" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ processed: { printed: 1, failed: 0 } });
    expect(database.db.prepare("SELECT printer_host, printer_port FROM print_jobs WHERE target_id = 'test-bill' ORDER BY created_at DESC LIMIT 1").get()).toEqual({
      printer_host: "192.168.1.71",
      printer_port: 9100
    });

    await app.close();
    database.close();
  });

  it("returns the exact test bill print failure from the API", async () => {
    const { app, database } = createFailingPrintTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/print-jobs/test-bill",
      headers: { "x-device-token": "test-admin-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ processed: { printed: 0, failed: 1, error: "printer offline" } });
    expect(database.db.prepare("SELECT status, last_error FROM print_jobs WHERE target_id = 'test-bill' ORDER BY created_at DESC LIMIT 1").get()).toEqual({
      status: "failed",
      last_error: "printer offline"
    });

    await app.close();
    database.close();
  });

  it("configures receipt printer and processes bill print in test mode", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    await app.inject({
      method: "PUT",
      url: "/settings/receipt-printer",
      headers,
      payload: { printerHost: "192.168.1.70", printerPort: 9100 }
    });
    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      headers,
      payload: { newPin: "1234", updatedBy: "admin" }
    });
    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: {
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 1,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });
    const order = orderResponse.json<{ orderId: string }>();
    const billResponse = await app.inject({
      method: "POST",
      url: `/bills/${order.orderId}/generate`,
      headers
    });
    const bill = billResponse.json<{ billId: string; totalPaise: number; processed: { printed: number; failed: number; skipped: number } }>();
    const settleResponse = await app.inject({
      method: "POST",
      url: `/bills/${bill.billId}/settle`,
      headers,
      payload: { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" }
    });
    const printResponse = await app.inject({
      method: "POST",
      url: "/print-jobs/process",
      headers
    });

    expect(billResponse.statusCode).toBe(200);
    expect(bill.processed).toEqual({ printed: 1, failed: 0, skipped: 0 });
    expect(settleResponse.json()).toMatchObject({ status: "paid" });
    expect(settleResponse.json()).not.toHaveProperty("printJobId");
    expect(settleResponse.json()).not.toHaveProperty("processed");
    expect(printResponse.json()).toEqual({ printed: 0, failed: 0 });
    const printJob = database.db.prepare("SELECT status, payload FROM print_jobs WHERE target_id = ?").get(bill.billId) as { status: string; payload: string };
    expect(printJob.status).toBe("printed");
    expect(printJob.payload).toContain("CGST @ 2.5%: 4.50");
    expect(printJob.payload).toContain("SGST @ 2.5%: 4.50");
    expect(printJob.payload).not.toContain("Food CGST");

    await app.close();
    database.close();
  });

  it("allows captain stock edits with manager PIN and exposes alcohol movement reports", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };
    await setTestManagerPin(app);
    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: pairingPayload("Captain tablet", "captain")
    });
    const pairing = pairingResponse.json<{ code: string }>();
    const exchangeResponse = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: pairing.code, deviceName: "Captain tablet" }
    });
    const captain = exchangeResponse.json<{ token: string }>();
    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      headers: adminHeaders,
      payload: { newPin: "1234", updatedBy: "admin" }
    });
    const alcoholResponse = await app.inject({
      method: "POST",
      url: "/alcohol/items",
      headers: adminHeaders,
      payload: {
        type: "plain_liquor",
        name: "Captain Whisky",
        productionUnitId: "unit-bar",
        largeBottleMl: 750,
        smallBottleMl: 180,
        sealedLargeCount: 0,
        openLargeMl: 0,
        sealedSmallCount: 0,
        variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
        recipeIngredients: []
      }
    });
    const alcohol = alcoholResponse.json<{ id: string }>();

    const adjustResponse = await app.inject({
      method: "POST",
      url: `/alcohol/stock/${alcohol.id}/adjust`,
      headers: { "x-device-token": captain.token },
      payload: {
        mode: "delta",
        sealedLargeCount: 2,
        managerApproval: { pin: "1234", reason: "Alcohol stock edit", approvedBy: "manager" }
      }
    });
    const movementsResponse = await app.inject({
      method: "GET",
      url: "/reports/alcohol-stock-movements",
      headers: { "x-device-token": captain.token }
    });

    expect(adjustResponse.statusCode).toBe(200);
    expect(movementsResponse.statusCode).toBe(200);
    expect(movementsResponse.json<Array<{ item_name: string; source_type: string }>>()[0]).toMatchObject({
      item_name: "Captain Whisky",
      source_type: "manual_adjustment"
    });

    await app.close();
    database.close();
  });

  it("imports normal dishes from CSV and reports bad rows", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    const response = await app.inject({
      method: "POST",
      url: "/menu-items/import-csv",
      headers,
      payload: {
        csv: [
          "name,price,kitchen_or_counter,sale_category,active",
          "Veg Fried Rice,180,Kitchen,Food,true",
          "Bad Free Item,0,Kitchen,Food,true"
        ].join("\n")
      }
    });
    const catalogResponse = await app.inject({ method: "GET", url: "/menu-items?includeInactive=1", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      created: 1,
      failed: 1,
      errors: [{ row: 3 }]
    });
    expect(catalogResponse.json<Array<{ name: string; price_paise: number; production_unit_name: string; sale_group_name: string }>>()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Veg Fried Rice",
          price_paise: 18_000,
          production_unit_name: "Kitchen",
          sale_group_name: "Food"
        })
      ])
    );

    await app.close();
    database.close();
  });

  it("imports plain liquor stock from CSV", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    const response = await app.inject({
      method: "POST",
      url: "/alcohol/items/import-csv",
      headers,
      payload: {
        type: "plain_liquor",
        csv: [
          "name,bar_counter,large_bottle_ml,small_bottle_ml,sealed_large_count,open_large_ml,sealed_small_count,shot_price,small_bottle_price,large_bottle_price,active",
          "Imported Whisky,Bar,750,180,6,120,3,40,250,900,true"
        ].join("\n")
      }
    });
    const catalogResponse = await app.inject({ method: "GET", url: "/alcohol", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ created: 1, failed: 0 });
    expect(catalogResponse.json<{ items: Array<{ name: string; type: string; sealed_large_count: number; open_large_ml: number; sealed_small_count: number; variants: Array<{ label: string; price_paise: number }> }> }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Imported Whisky",
          type: "plain_liquor",
          sealed_large_count: 6,
          open_large_ml: 120,
          sealed_small_count: 3,
          variants: expect.arrayContaining([
            expect.objectContaining({ label: "30 ml", price_paise: 4_000 }),
            expect.objectContaining({ label: "180 ml", price_paise: 25_000 }),
            expect.objectContaining({ label: "750 ml", price_paise: 90_000 })
          ])
        })
      ])
    );

    await app.close();
    database.close();
  });

  it("imports prepared alcohol products with recipe references", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    await app.inject({
      method: "POST",
      url: "/alcohol/items/import-csv",
      headers,
      payload: {
        type: "plain_liquor",
        csv: "name,bar_counter,shot_price\nImported Vodka,Bar,60"
      }
    });
    const response = await app.inject({
      method: "POST",
      url: "/alcohol/items/import-csv",
      headers,
      payload: {
        type: "prepared_product",
        csv: "name,bar_counter,price,recipe,active\nImported Cocktail,Bar,350,Imported Vodka:60,true"
      }
    });
    const catalogResponse = await app.inject({ method: "GET", url: "/alcohol", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ created: 1, failed: 0 });
    expect(catalogResponse.json<{ items: Array<{ name: string; type: string; variants: Array<{ label: string; price_paise: number }>; recipeIngredients: Array<{ liquor_name: string; ml_per_unit: number }> }> }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Imported Cocktail",
          type: "prepared_product",
          variants: expect.arrayContaining([expect.objectContaining({ label: "Regular", price_paise: 35_000 })]),
          recipeIngredients: expect.arrayContaining([expect.objectContaining({ liquor_name: "Imported Vodka", ml_per_unit: 60 })])
        })
      ])
    );

    await app.close();
    database.close();
  });
});
