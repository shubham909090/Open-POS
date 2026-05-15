import { describe, expect, it } from "vitest";
import { normalizeHubCommandPayload } from "./hubCommands";

describe("hub command payload validation", () => {
  it("normalizes device commands around hubDeviceId and rejects removed roles", () => {
    expect(
      JSON.parse(normalizeHubCommandPayload("device.updated", JSON.stringify({ localDeviceId: "old", hubDeviceId: " device-1 ", role: "captain" })))
    ).toEqual({ hubDeviceId: "device-1", role: "captain" });

    expect(() => normalizeHubCommandPayload("device.updated", JSON.stringify({ hubDeviceId: "device-1", role: "cashier" }))).toThrow(
      "Device role must be admin, captain, waiter, or kitchen"
    );
  });

  it("rejects incomplete menu and kitchen commands before they reach a hub", () => {
    expect(() => normalizeHubCommandPayload("menu_item.upsert", JSON.stringify({ id: "item-1", pricePaise: 12000 }))).toThrow(
      "Menu item name is required"
    );
    expect(() => normalizeHubCommandPayload("production_unit.upsert", JSON.stringify({ id: "unit-1" }))).toThrow(
      "Kitchen/counter name is required"
    );
  });

  it("accepts valid printer updates and rejects invalid printer ports", () => {
    expect(JSON.parse(normalizeHubCommandPayload("receipt_printer.updated", JSON.stringify({ printerMode: "system", printerName: "EPSON" })))).toEqual({
      printerMode: "system",
      printerName: "EPSON"
    });
    expect(() => normalizeHubCommandPayload("receipt_printer.updated", JSON.stringify({ printerPort: 99999 }))).toThrow(
      "Printer port must be between 1 and 65535"
    );
  });
});
