import { formatPosDateTime } from "@gaurav-pos/shared";

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
  taxBreakdown?: Array<{ name: string; rateBps?: number; amountPaise: number }>;
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

const DEFAULT_TICKET_LINE_WIDTH = 28;

function ticketWidth(value?: number): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_TICKET_LINE_WIDTH;
  return Math.max(24, Math.min(64, Math.floor(value)));
}

function separator(width: number): string {
  return "-".repeat(width);
}

function money(valuePaise: number): string {
  return (valuePaise / 100).toFixed(2);
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

function right(value: string, width: number): string {
  return truncateTicketText(value, width).padStart(width);
}

function wrapTicketText(value: string, width: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(truncateTicketText(current, width));
      current = word;
    }
  }
  if (current) lines.push(truncateTicketText(current, width));
  return lines.length ? lines : [""];
}

function renderBillItemLines(item: BillTicketItem, width: number): string[] {
  const variantName = item.variantName?.trim();
  const shouldAppendVariant = Boolean(variantName && variantName.toLowerCase() !== "regular" && !item.name.toLowerCase().includes(variantName.toLowerCase()));
  const name = shouldAppendVariant ? `${item.name} ${variantName}` : item.name;
  if (width < 32) {
    const amount = money(item.lineTotalPaise);
    const itemText = `${item.quantity} x ${name}`;
    const itemWidth = Math.max(8, width - amount.length - 1);
    const nameLines = wrapTicketText(itemText, itemWidth);
    return [
      `${(nameLines[0] ?? "").padEnd(itemWidth)} ${amount}`,
      ...nameLines.slice(1).map((line) => line.padEnd(itemWidth))
    ];
  }
  const qtyWidth = 4;
  const rateWidth = 8;
  const amountWidth = 9;
  const itemWidth = Math.max(8, width - qtyWidth - rateWidth - amountWidth - 3);
  const nameLines = wrapTicketText(name, itemWidth);
  const firstNameLine = nameLines[0] ?? "";
  const first = `${firstNameLine.padEnd(itemWidth)} ${right(String(item.quantity), qtyWidth)} ${right(money(item.unitPricePaise), rateWidth)} ${right(money(item.lineTotalPaise), amountWidth)}`;
  return [first, ...nameLines.slice(1).map((line) => line.padEnd(itemWidth))];
}

function renderMoneyLine(label: string, valuePaise: number, width: number): string {
  const amount = money(valuePaise);
  return `${truncateTicketText(label, Math.max(8, width - amount.length - 1)).padEnd(Math.max(0, width - amount.length))}${amount}`;
}

function formatRateBps(rateBps?: number): string | null {
  if (!rateBps || !Number.isFinite(rateBps)) return null;
  return (rateBps / 100).toFixed(2).replace(/\.?0+$/, "");
}

function renderTaxLine(label: string, valuePaise: number, width: number, rateBps?: number): string {
  const rate = formatRateBps(rateBps);
  const suffix = `${rate ? ` @ ${rate}%` : ""}: ${money(valuePaise)}`;
  return `${truncateTicketText(label, Math.max(3, width - suffix.length))}${suffix}`;
}

function kotTitle(type: string): string {
  switch (type) {
    case "partial_cancel":
    case "cancelled":
      return "CANCELLED";
    case "table_shifted":
      return "TABLE SHIFTED";
    case "modified":
      return "MODIFIED";
    case "reprint":
      return "REPRINT";
    case "new":
      return "NEW";
    default:
      return type.replace(/_/g, " ").toUpperCase();
  }
}

function compactShiftReason(reason: string): string {
  const normalized = reason.trim();
  const tableMove = normalized.match(/Table shifted from\s+([^:]+?)\s+to\s+([^:]+?)(?::|$)/i);
  const [, sourceTable, targetTable] = tableMove ?? [];
  if (sourceTable && targetTable) return `${sourceTable.trim()} -> ${targetTable.trim()}`;
  const from = normalized.match(/(?:Items shifted from|from)\s+([^:]+?)(?:\s+because|:|$)/i);
  const [, sourceItemsTable] = from ?? [];
  if (sourceItemsTable) return `From ${sourceItemsTable.trim()}`;
  const to = normalized.match(/(?:Items shifted to|to)\s+([^:]+?)(?:\s+because|:|$)/i);
  const [, targetItemsTable] = to ?? [];
  if (targetItemsTable) return `To ${targetItemsTable.trim()}`;
  return truncateTicketText(normalized, 18);
}

export function renderKotTicket(ticket: KotTicket): string {
  const width = ticketWidth(ticket.lineWidthChars);
  const title = kotTitle(ticket.type);
  const lines = [
    ...(ticket.header ? [...alignTicketText(ticket.header, width, ticket.headerAlign), separator(width)] : []),
    ...centerTicketText(`${ticket.ticketLabel ?? "KOT"} #${ticket.sequence} ${title}`, width),
    ...(ticket.reason ? [...centerTicketText(ticket.type === "table_shifted" ? compactShiftReason(ticket.reason) : ticket.reason, width), separator(width)] : []),
    `Station: ${ticket.productionUnitName}`,
    ...(ticket.showTable === false ? [] : [`Table: ${ticket.tableName}`]),
    ...(ticket.showCaptain === false ? [] : [`Captain: ${ticket.captainId}`]),
    ...(ticket.showDateTime === false ? [] : [`Time: ${formatPosDateTime(ticket.createdAt)}`]),
    separator(width)
  ];

  for (const item of ticket.items) {
    const sign = item.quantityDelta > 0 ? "+" : "";
    lines.push(...wrapTicketText(`${sign}${item.quantityDelta} x ${item.name}`, width));
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
          ...(ticket.revisionNumber && ticket.revisionNumber > 1 ? [`Modified rev ${ticket.revisionNumber}`] : []),
          ...(ticket.ncReason ? centerTicketText("NC / NON CUSTOMER", width) : [])
        ]),
    ...(ticket.showTable === false ? [] : [`Table: ${ticket.tableName}`]),
    ...(ticket.showDateTime === false ? [] : [`Date: ${formatPosDateTime(ticket.createdAt)}`]),
    ...(ticket.taxRegistrationText ? [ticket.taxRegistrationText] : []),
    separator(width),
    ...(ticket.items?.length
	      ? [
	          width < 32 ? `${"Item".padEnd(Math.max(8, width - 7))} ${right("Amt", 6)}` : `${"Item".padEnd(Math.max(8, width - 25))} ${right("Qty", 4)} ${right("Rate", 8)} ${right("Amt", 9)}`,
          separator(width),
          ...ticket.items.flatMap((item) => renderBillItemLines(item, width)),
          separator(width)
        ]
      : []),
    renderMoneyLine("Subtotal", ticket.subtotalPaise, width),
    ...(ticket.taxBreakdown?.length
      ? ticket.showTaxBreakup === false
        ? [renderTaxLine("Tax", ticket.taxPaise, width)]
        : ticket.taxBreakdown.map((line) => renderTaxLine(line.name, line.amountPaise, width, line.rateBps))
      : ticket.taxPaise > 0
        ? [renderTaxLine("Tax", ticket.taxPaise, width)]
        : []),
    renderMoneyLine("Total", ticket.totalPaise, width)
  ];

  if (ticket.showDiscountTip !== false && ticket.discountPaise) lines.push(renderMoneyLine("Discount", -ticket.discountPaise, width));
  if (ticket.showDiscountTip !== false && ticket.tipPaise) lines.push(renderMoneyLine("Tip", ticket.tipPaise, width));
  if (ticket.finalTotalPaise && ticket.finalTotalPaise !== ticket.totalPaise) {
    lines.push(renderMoneyLine("Final", ticket.finalTotalPaise, width));
  }
  if (ticket.showPaymentSplit !== false && ticket.payments?.length) {
    lines.push(
      separator(width),
      "Payments",
      ...ticket.payments.map((payment) => renderMoneyLine(payment.method.toUpperCase(), payment.amountPaise, width))
    );
  }
  if (ticket.showNcReprintRevision !== false && ticket.ncReason) lines.push(`NC Reason: ${ticket.ncReason}`);
  if (ticket.footer) lines.push(separator(width), ...alignTicketText(ticket.footer, width, ticket.footerAlign));

  return `${lines.join("\n")}${ticketFeed(ticket.feedLines)}`;
}
