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
  items?: BillTicketItem[];
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

export interface BillTicketItem {
  name: string;
  variantName?: string | null;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
}

const TICKET_LINE_WIDTH = 32;

function truncateTicketText(value: string, maxLength = TICKET_LINE_WIDTH): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function renderBillItemLines(item: BillTicketItem): string[] {
  const name = item.variantName ? `${item.name} ${item.variantName}` : item.name;
  const detail = `${item.quantity} x ${formatInr(item.unitPricePaise)} = ${formatInr(item.lineTotalPaise)}`;
  const compactAvailableNameLength = TICKET_LINE_WIDTH - detail.length - 2;

  if (compactAvailableNameLength >= 8 && name.length <= compactAvailableNameLength) {
    return [`${name.padEnd(compactAvailableNameLength)}  ${detail}`];
  }

  return [truncateTicketText(name), `  ${detail}`];
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
    ...(ticket.items?.length
      ? [
          "Item  Qty  Rate  Amt",
          "-".repeat(32),
          ...ticket.items.flatMap((item) => renderBillItemLines(item)),
          "-".repeat(32)
        ]
      : []),
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
