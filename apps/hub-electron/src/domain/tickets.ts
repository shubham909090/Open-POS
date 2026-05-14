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
  ticketLabel?: string;
  captainId: string;
  createdAt: string;
  items: KotTicketItem[];
  reason?: string | null;
  header?: string;
  footer?: string;
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
  taxBreakdown?: Array<{ name: string; amountPaise: number }>;
  header?: string;
  footer?: string;
  restaurantName?: string;
  taxRegistrationText?: string;
  ncReason?: string | null;
  revisionNumber?: number;
}

export function renderKotTicket(ticket: KotTicket): string {
  const lines = [
    ...(ticket.header ? [ticket.header, "-".repeat(32)] : []),
    `${ticket.ticketLabel ?? "KOT"} #${ticket.sequence} ${ticket.type.toUpperCase()}`,
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
  if (ticket.footer) lines.push("-".repeat(32), ticket.footer);

  return `${lines.join("\n")}\n\n\n`;
}

export function renderBillTicket(ticket: BillTicket): string {
  const lines = [
    ...(ticket.restaurantName ? [ticket.restaurantName] : []),
    ...(ticket.header ? [ticket.header] : []),
    `BILL ${ticket.billId}`,
    ...(ticket.revisionNumber && ticket.revisionNumber > 1 ? [`Revision: ${ticket.revisionNumber}`] : []),
    ...(ticket.ncReason ? ["NC / NON CUSTOMER"] : []),
    `Table: ${ticket.tableName}`,
    `Time: ${ticket.createdAt}`,
    ...(ticket.taxRegistrationText ? [ticket.taxRegistrationText] : []),
    "-".repeat(32),
    `Subtotal: ${formatInr(ticket.subtotalPaise)}`,
    ...(ticket.taxBreakdown?.length
      ? ticket.taxBreakdown.map((line) => `${line.name}: ${formatInr(line.amountPaise)}`)
      : [`Tax: ${formatInr(ticket.taxPaise)}`]),
    `Total: ${formatInr(ticket.totalPaise)}`
  ];

  if (ticket.discountPaise) lines.push(`Discount: -${formatInr(ticket.discountPaise)}`);
  if (ticket.tipPaise) lines.push(`Tip: ${formatInr(ticket.tipPaise)}`);
  if (ticket.finalTotalPaise && ticket.finalTotalPaise !== ticket.totalPaise) {
    lines.push(`Final: ${formatInr(ticket.finalTotalPaise)}`);
  }
  if (ticket.ncReason) lines.push(`NC Reason: ${ticket.ncReason}`);
  if (ticket.footer) lines.push("-".repeat(32), ticket.footer);

  lines.push("\n\n");
  return lines.join("\n");
}
