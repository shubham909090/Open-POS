export type HubCommandType =
  | "device.revoked"
  | "device.updated"
  | "menu_item.upsert"
  | "menu_item.disabled"
  | "production_unit.upsert"
  | "receipt_printer.updated";

const localDeviceRoles = ["admin", "captain", "waiter", "kitchen"] as const;

export function normalizeHubCommandPayload(type: HubCommandType, payloadJson: string): string {
  if (!payloadJson.trim()) throw new Error("Command payload JSON is required");
  const payload = JSON.parse(payloadJson) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Command payload must be a JSON object");
  }
  const normalized = { ...(payload as Record<string, unknown>) };

  const requiredString = (field: string, label: string) => {
    const value = normalized[field];
    if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
    normalized[field] = value.trim();
  };
  const requiredNumber = (field: string, label: string) => {
    const value = normalized[field];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} is required`);
  };
  const optionalPrinterMode = () => {
    const value = normalized.printerMode;
    if (value !== undefined && value !== "system" && value !== "network") {
      throw new Error("Printer mode must be system or network");
    }
  };
  const optionalPrinterPort = () => {
    const value = normalized.printerPort;
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error("Printer port must be between 1 and 65535");
    }
  };

  if (type === "device.revoked" || type === "device.updated") {
    const hubDeviceId = normalized.hubDeviceId;
    if (typeof hubDeviceId !== "string" || !hubDeviceId.trim()) {
      throw new Error("Device commands require hubDeviceId");
    }
    normalized.hubDeviceId = hubDeviceId.trim();
    delete normalized.localDeviceId;
    if (normalized.role !== undefined && !localDeviceRoles.includes(normalized.role as (typeof localDeviceRoles)[number])) {
      throw new Error("Device role must be admin, captain, waiter, or kitchen");
    }
  }
  if (type === "menu_item.upsert") {
    requiredString("id", "Menu item id");
    requiredString("name", "Menu item name");
    requiredNumber("pricePaise", "Menu item price");
    if (normalized.productionUnitId !== undefined && normalized.productionUnitId !== null && typeof normalized.productionUnitId !== "string") {
      throw new Error("Menu item productionUnitId must be a string or null");
    }
    if (normalized.active !== undefined && typeof normalized.active !== "boolean") throw new Error("Menu item active must be boolean");
  }
  if (type === "menu_item.disabled") requiredString("id", "Menu item id");
  if (type === "production_unit.upsert") {
    requiredString("id", "Kitchen/counter id");
    requiredString("name", "Kitchen/counter name");
    optionalPrinterMode();
    optionalPrinterPort();
  }
  if (type === "receipt_printer.updated") {
    optionalPrinterMode();
    if (normalized.printerName !== undefined && typeof normalized.printerName !== "string") throw new Error("Printer name must be a string");
    if (normalized.printerHost !== undefined && typeof normalized.printerHost !== "string") throw new Error("Printer host must be a string");
    optionalPrinterPort();
  }

  return JSON.stringify(normalized);
}
