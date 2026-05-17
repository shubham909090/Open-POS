export const commandTypes = [
  "menu_item.upsert",
  "menu_item.disabled",
  "production_unit.upsert",
  "receipt_printer.updated",
  "device.updated",
  "device.revoked"
] as const;

export type CommandType = (typeof commandTypes)[number];

export function commandPayloadTemplate(type: CommandType) {
  const templates: Record<CommandType, object> = {
    "menu_item.upsert": {
      id: "item-example",
      name: "Example dish",
      pricePaise: 10000,
      productionUnitId: null,
      active: true
    },
    "menu_item.disabled": { id: "item-example" },
    "production_unit.upsert": {
      id: "unit-example",
      name: "Kitchen",
      printerMode: "network",
      printerHost: "192.168.1.50",
      printerPort: 9100,
      kdsEnabled: true,
      active: true
    },
    "receipt_printer.updated": {
      printerMode: "system",
      printerName: "Cash Counter Printer",
      printerHost: "",
      printerPort: 9100
    },
    "device.updated": { hubDeviceId: "paste-hub-device-id", name: "Captain phone", role: "captain", status: "active" },
    "device.revoked": { hubDeviceId: "paste-hub-device-id" }
  };
  return JSON.stringify(templates[type], null, 2);
}

export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(paise / 100);
}

export function humanPayments(paymentsJson: string) {
  try {
    const payments = JSON.parse(paymentsJson) as Array<{ method: string; amountPaise: number }>;
    return payments.map((payment) => `${payment.method.toUpperCase()} ${money(payment.amountPaise)}`).join(", ");
  } catch {
    return "Payment details unavailable";
  }
}

export function friendlyEvent(type: string) {
  if (type === "daily_report.finalized") return "Daily report received";
  if (type === "bill.settled") return "Bill paid";
  if (type === "order.submitted") return "Order sent";
  return type.replaceAll("_", " ").replaceAll(".", " ");
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
