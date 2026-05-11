import { formatInr } from "@gaurav-pos/shared";

export interface KotTicketItem {
  name: string;
  quantityDelta: number;
}

export interface KotTicket {
  sequence: number;
  type: string;
  tableName: string;
  productionUnitName: string;
  captainId: string;
  createdAt: string;
  items: KotTicketItem[];
  reason?: string | null;
}

export interface BillTicket {
  tableName: string;
  billId: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  discountPaise?: number;
  tipPaise?: number;
  finalTotalPaise?: number;
  createdAt: string;
}

export function renderKotTicket(ticket: KotTicket): string {
  const lines = [
    `KOT #${ticket.sequence} ${ticket.type.toUpperCase()}`,
    `Station: ${ticket.productionUnitName}`,
    `Table: ${ticket.tableName}`,
    `Captain: ${ticket.captainId}`,
    `Time: ${ticket.createdAt}`,
    "-".repeat(32)
  ];

  for (const item of ticket.items) {
    const sign = item.quantityDelta > 0 ? "+" : "";
    lines.push(`${sign}${item.quantityDelta} ${item.name}`);
  }

  if (ticket.reason) {
    lines.push("-".repeat(32), `Reason: ${ticket.reason}`);
  }

  return `${lines.join("\n")}\n\n\n`;
}

export function renderBillTicket(ticket: BillTicket): string {
  const lines = [
    `BILL ${ticket.billId}`,
    `Table: ${ticket.tableName}`,
    `Time: ${ticket.createdAt}`,
    "-".repeat(32),
    `Subtotal: ${formatInr(ticket.subtotalPaise)}`,
    `Tax: ${formatInr(ticket.taxPaise)}`,
    `Total: ${formatInr(ticket.totalPaise)}`
  ];

  if (ticket.discountPaise) lines.push(`Discount: -${formatInr(ticket.discountPaise)}`);
  if (ticket.tipPaise) lines.push(`Tip: ${formatInr(ticket.tipPaise)}`);
  if (ticket.finalTotalPaise && ticket.finalTotalPaise !== ticket.totalPaise) {
    lines.push(`Final: ${formatInr(ticket.finalTotalPaise)}`);
  }

  lines.push("\n\n");
  return lines.join("\n");
}
