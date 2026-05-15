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
  lineWidthChars?: number;
  headerAlign?: "left" | "center";
  footerAlign?: "left" | "center";
  feedLines?: number;
  showTable?: boolean;
  showCaptain?: boolean;
  showDateTime?: boolean;
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
  payments?: Array<{ method: string; amountPaise: number }>;
  header?: string;
  footer?: string;
  restaurantName?: string;
  taxRegistrationText?: string;
  ncReason?: string | null;
  revisionNumber?: number;
  lineWidthChars?: number;
  headerAlign?: "left" | "center";
  footerAlign?: "left" | "center";
  feedLines?: number;
  showTable?: boolean;
  showDateTime?: boolean;
  showBillId?: boolean;
  showTaxBreakup?: boolean;
  showPaymentSplit?: boolean;
  showDiscountTip?: boolean;
  showNcReprintRevision?: boolean;
}

export interface BillTicketItem {
  name: string;
  variantName?: string | null;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
}

const DEFAULT_TICKET_LINE_WIDTH = 42;

function ticketWidth(value?: number): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_TICKET_LINE_WIDTH;
  return Math.max(32, Math.min(64, Math.floor(value)));
}

function separator(width: number): string {
  return "-".repeat(width);
}

function truncateTicketText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function centerTicketText(value: string, width: number): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const text = truncateTicketText(line, width);
      const left = Math.max(0, Math.floor((width - text.length) / 2));
      return `${" ".repeat(left)}${text}`;
    });
}

function alignTicketText(value: string, width: number, align: "left" | "center" = "center"): string[] {
  if (align === "left") {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => truncateTicketText(line, width));
  }
  return centerTicketText(value, width);
}

function ticketFeed(feedLines?: number): string {
  return "\n".repeat(Math.max(1, Math.min(8, feedLines ?? 3)));
}

function renderBillItemLines(item: BillTicketItem, width: number): string[] {
  const name = item.variantName ? `${item.name} ${item.variantName}` : item.name;
  const detail = `${item.quantity} x ${formatInr(item.unitPricePaise)} = ${formatInr(item.lineTotalPaise)}`;
  const compactAvailableNameLength = width - detail.length - 2;

  if (compactAvailableNameLength >= 8 && name.length <= compactAvailableNameLength) {
    return [`${name.padEnd(compactAvailableNameLength)}  ${detail}`];
  }

  return [truncateTicketText(name, width), `  ${detail}`];
}

export function renderKotTicket(ticket: KotTicket): string {
  const width = ticketWidth(ticket.lineWidthChars);
  const lines = [
    ...(ticket.header ? [...alignTicketText(ticket.header, width, ticket.headerAlign), separator(width)] : []),
    ...centerTicketText(`${ticket.ticketLabel ?? "KOT"} #${ticket.sequence} ${ticket.type.toUpperCase()}`, width),
    `Station: ${ticket.productionUnitName}`,
    ...(ticket.showTable === false ? [] : [`Table: ${ticket.tableName}`]),
    ...(ticket.showCaptain === false ? [] : [`Captain: ${ticket.captainId}`]),
    ...(ticket.showDateTime === false ? [] : [`Time: ${ticket.createdAt}`]),
    separator(width)
  ];

  for (const item of ticket.items) {
    const sign = item.quantityDelta > 0 ? "+" : "";
    lines.push(`${sign}${item.quantityDelta} ${item.name}`);
  }

  if (ticket.reason) {
    lines.push(separator(width), `Reason: ${ticket.reason}`);
  }
  if (ticket.footer) lines.push(separator(width), ...alignTicketText(ticket.footer, width, ticket.footerAlign));

  return `${lines.join("\n")}${ticketFeed(ticket.feedLines)}`;
}

export function renderBillTicket(ticket: BillTicket): string {
  const width = ticketWidth(ticket.lineWidthChars);
  const lines = [
    ...(ticket.restaurantName ? alignTicketText(ticket.restaurantName, width, ticket.headerAlign) : []),
    ...(ticket.header ? alignTicketText(ticket.header, width, ticket.headerAlign) : []),
    ...(ticket.showBillId === false ? [] : centerTicketText(`BILL ${ticket.billId}`, width)),
    ...(ticket.showNcReprintRevision === false
      ? []
      : [
          ...(ticket.revisionNumber && ticket.revisionNumber > 1 ? [`Revision: ${ticket.revisionNumber}`] : []),
          ...(ticket.ncReason ? centerTicketText("NC / NON CUSTOMER", width) : [])
        ]),
    ...(ticket.showTable === false ? [] : [`Table: ${ticket.tableName}`]),
    ...(ticket.showDateTime === false ? [] : [`Time: ${ticket.createdAt}`]),
    ...(ticket.taxRegistrationText ? [ticket.taxRegistrationText] : []),
    separator(width),
    ...(ticket.items?.length
      ? [
          "Item  Qty  Rate  Amt",
          separator(width),
          ...ticket.items.flatMap((item) => renderBillItemLines(item, width)),
          separator(width)
        ]
      : []),
    `Subtotal: ${formatInr(ticket.subtotalPaise)}`,
    ...(ticket.taxBreakdown?.length
      ? ticket.showTaxBreakup === false
        ? [`Tax: ${formatInr(ticket.taxPaise)}`]
        : ticket.taxBreakdown.map((line) => `${line.name}: ${formatInr(line.amountPaise)}`)
      : [`Tax: ${formatInr(ticket.taxPaise)}`]),
    `Total: ${formatInr(ticket.totalPaise)}`
  ];

  if (ticket.showDiscountTip !== false && ticket.discountPaise) lines.push(`Discount: -${formatInr(ticket.discountPaise)}`);
  if (ticket.showDiscountTip !== false && ticket.tipPaise) lines.push(`Tip: ${formatInr(ticket.tipPaise)}`);
  if (ticket.finalTotalPaise && ticket.finalTotalPaise !== ticket.totalPaise) {
    lines.push(`Final: ${formatInr(ticket.finalTotalPaise)}`);
  }
  if (ticket.showPaymentSplit !== false && ticket.payments?.length) {
    lines.push(
      separator(width),
      "Payments",
      ...ticket.payments.map((payment) => `${payment.method.toUpperCase()}: ${formatInr(payment.amountPaise)}`)
    );
  }
  if (ticket.showNcReprintRevision !== false && ticket.ncReason) lines.push(`NC Reason: ${ticket.ncReason}`);
  if (ticket.footer) lines.push(separator(width), ...alignTicketText(ticket.footer, width, ticket.footerAlign));

  return `${lines.join("\n")}${ticketFeed(ticket.feedLines)}`;
}
