import { formatInr } from "@gaurav-pos/shared";

export interface KotTicketItem {
  name: string;
  quantityDelta: number;
  notes: string;
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
    if (item.notes) lines.push(`  Note: ${item.notes}`);
  }

  if (ticket.reason) {
    lines.push("-".repeat(32), `Reason: ${ticket.reason}`);
  }

  return `${lines.join("\n")}\n\n\n`;
}

export function renderBillTicket(ticket: BillTicket): string {
  return [
    `BILL ${ticket.billId}`,
    `Table: ${ticket.tableName}`,
    `Time: ${ticket.createdAt}`,
    "-".repeat(32),
    `Subtotal: ${formatInr(ticket.subtotalPaise)}`,
    `Tax: ${formatInr(ticket.taxPaise)}`,
    `Total: ${formatInr(ticket.totalPaise)}`,
    "\n\n"
  ].join("\n");
}
