import { formatPosDateTime, printSizeScale } from "@gaurav-pos/shared";

export interface KotTicketItem {
  name: string;
  quantityDelta: number;
  note?: string | null;
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
  note?: string | null;
  header?: string;
  footer?: string;
  lineWidthChars?: number;
  headerAlign?: "left" | "center";
  footerAlign?: "left" | "center";
  sectionStyles?: TicketSectionStyles;
  topPaddingLines?: number;
  feedLines?: number;
  showTable?: boolean;
  showCaptain?: boolean;
  showDateTime?: boolean;
}

export interface BillTicket {
  paperWidthMm?: number;
  restaurantLogo?: { imageDataUrl: string; widthMm?: number } | null;
  paymentQr?: { imageDataUrl: string; upiUri: string; sizeMm?: number } | null;
  tableName: string;
  billId: string;
  customerName?: string | null;
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
  restaurantAddress?: string;
  taxRegistrationText?: string;
  ncReason?: string | null;
  revisionNumber?: number;
  lineWidthChars?: number;
  headerAlign?: "left" | "center";
  footerAlign?: "left" | "center";
  sectionStyles?: TicketSectionStyles;
  topPaddingLines?: number;
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
type TicketAlign = "left" | "center" | "right";
type TicketTextSize = "small" | "normal" | "large";
interface TicketSectionStyle {
  size: TicketTextSize;
  sizeLevel?: number;
  bold: boolean;
  align: TicketAlign;
}
type TicketSection = "restaurantName" | "address" | "header" | "title" | "metadata" | "items" | "totals" | "notes" | "itemNotes" | "footer";
export type TicketSectionStyles = Partial<Record<TicketSection, TicketSectionStyle>>;
export const PRINT_STYLE_MARKER = "\u001e";
export const PRINT_LINE_MARKER = "\u001dline:";
export const PRINT_LOGO_MARKER = "\u001dlogo:";
export const PRINT_QR_MARKER = "\u001dqr:";
export const PRINT_PAPER_MARKER = "\u001dpaper:";
const PRINT_STYLE_PLAIN_TEXT_SEPARATOR = "\u001f";

export interface ParsedPrintStyleLine {
  text: string;
  plainText: string;
  size: TicketTextSize;
  sizeLevel?: number;
  bold: boolean;
  align: TicketAlign;
  graphicLine?: boolean;
  logoImageDataUrl?: string;
  logoWidthMm?: number;
  qrImageDataUrl?: string;
  qrSizeMm?: number;
  paperWidthChars?: number;
}

interface TicketLine {
  text: string;
  section: TicketSection;
  logoImageDataUrl?: string;
  logoWidthMm?: number;
  qrImageDataUrl?: string;
  qrSizeMm?: number;
}

function defaultSectionStyle(section: TicketSection, align: TicketAlign): TicketSectionStyle {
  return {
    align,
    bold: section === "restaurantName" || section === "title" || section === "totals",
    size: section === "restaurantName" || section === "title" ? "large" : "normal"
  };
}

function resolvedSectionStyle(styles: TicketSectionStyles | undefined, section: TicketSection, fallbackAlign: TicketAlign): TicketSectionStyle {
  return { ...defaultSectionStyle(section, fallbackAlign), ...(styles?.[section] ?? {}) };
}

function encodePrintStyleLine(line: TicketLine, styles: TicketSectionStyles | undefined, fallbackAlign: TicketAlign): string {
  if (line.logoImageDataUrl) return `${PRINT_LOGO_MARKER}${line.logoWidthMm ?? 32}:${line.logoImageDataUrl}`;
  if (line.qrImageDataUrl) return `${PRINT_QR_MARKER}${line.qrSizeMm ?? 32}:${line.qrImageDataUrl}`;
  if (isSeparatorText(line.text)) {
    return `${PRINT_LINE_MARKER}${line.text.length}${PRINT_STYLE_PLAIN_TEXT_SEPARATOR}${line.text}`;
  }
  const style = resolvedSectionStyle(styles, line.section, fallbackAlign);
  const text = style.align === "left" ? line.text : line.text.trim();
  return `${PRINT_STYLE_MARKER}${style.size}:${style.bold ? "1" : "0"}:${style.align}${style.sizeLevel === undefined ? "" : `:${style.sizeLevel}`}|${text}${PRINT_STYLE_PLAIN_TEXT_SEPARATOR}${line.text}`;
}

function defaultPrintAlign(section: TicketSection): TicketAlign {
  return section === "restaurantName" || section === "address" || section === "header" || section === "title" || section === "footer" ? "center" : "left";
}

export function parsePrintStyleLine(line: string): ParsedPrintStyleLine | null {
  if (line.startsWith(PRINT_LOGO_MARKER)) {
    const payload = line.slice(PRINT_LOGO_MARKER.length);
    const delimiter = payload.indexOf(":data:");
    const imageDataUrl = delimiter >= 0 ? payload.slice(delimiter + 1) : "";
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl) || imageDataUrl.length > 1_500_000) return null;
    return { text: "Restaurant logo", plainText: "", size: "normal", bold: false, align: "center", logoImageDataUrl: imageDataUrl, logoWidthMm: Math.max(16, Math.min(45, Number(payload.slice(0, delimiter)) || 32)) };
  }
  if (line.startsWith(PRINT_QR_MARKER)) {
    const qrPayload = line.slice(PRINT_QR_MARKER.length);
    const delimiter = qrPayload.indexOf(":data:");
    const qrSizeMm = Math.max(20, Math.min(45, Number(qrPayload.slice(0, delimiter)) || 32));
    const imageDataUrl = delimiter >= 0 ? qrPayload.slice(delimiter + 1) : qrPayload;
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl) || imageDataUrl.length > 1_500_000) return null;
    return { text: "Scan to pay", plainText: "", size: "normal", bold: false, align: "center", qrImageDataUrl: imageDataUrl, qrSizeMm };
  }
  if (line.startsWith(PRINT_PAPER_MARKER)) return { text: "", plainText: "", size: "normal", bold: false, align: "left", paperWidthChars: ticketWidth(Number(line.slice(PRINT_PAPER_MARKER.length))) };
  if (line.startsWith(PRINT_LINE_MARKER)) {
    const payload = line.slice(PRINT_LINE_MARKER.length);
    const plainTextIndex = payload.indexOf(PRINT_STYLE_PLAIN_TEXT_SEPARATOR);
    const widthRaw = plainTextIndex >= 0 ? payload.slice(0, plainTextIndex) : payload;
    const width = Math.max(1, Math.min(64, Number(widthRaw) || DEFAULT_TICKET_LINE_WIDTH));
    const plainText = plainTextIndex >= 0 ? payload.slice(plainTextIndex + PRINT_STYLE_PLAIN_TEXT_SEPARATOR.length) : separator(width);
    return { text: plainText, plainText, size: "normal", bold: false, align: "left", graphicLine: true };
  }
  if (!line.startsWith(PRINT_STYLE_MARKER)) return null;
  const separatorIndex = line.indexOf("|");
  if (separatorIndex < 0) return null;
  const [sizeRaw, boldRaw, alignRaw, levelRaw] = line.slice(PRINT_STYLE_MARKER.length, separatorIndex).split(":");
  const size = sizeRaw === "small" || sizeRaw === "large" ? sizeRaw : "normal";
  const align = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
  const payload = line.slice(separatorIndex + 1);
  const plainTextIndex = payload.indexOf(PRINT_STYLE_PLAIN_TEXT_SEPARATOR);
  const text = plainTextIndex >= 0 ? payload.slice(0, plainTextIndex) : payload;
  const plainText = plainTextIndex >= 0 ? payload.slice(plainTextIndex + PRINT_STYLE_PLAIN_TEXT_SEPARATOR.length) : text;
  const sizeLevel = levelRaw !== undefined && /^\d+$/.test(levelRaw) && Number(levelRaw) <= 10 ? Number(levelRaw) : undefined;
  return { text, plainText, size, ...(sizeLevel === undefined ? {} : { sizeLevel }), bold: boldRaw === "1", align };
}

export function stripPrintStyleMarkers(payload: string): string {
  return payload
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(PRINT_PAPER_MARKER))
    .map((line) => parsePrintStyleLine(line)?.plainText ?? line)
    .join("\n");
}

function ticketWidth(value?: number): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_TICKET_LINE_WIDTH;
  return Math.max(24, Math.min(64, Math.floor(value)));
}

function separator(width: number): string {
  return "_".repeat(width);
}

function isSeparatorText(text: string): boolean {
  return /^_+$/.test(text);
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

function alignTicketText(value: string, width: number, align: TicketAlign = "center"): string[] {
  if (align === "left") {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => truncateTicketText(line, width));
  }
  if (align === "right") {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => truncateTicketText(line, width).padStart(width));
  }
  return centerTicketText(value, width);
}

function sectionAlign(
  styles: TicketSectionStyles | undefined,
  section: keyof NonNullable<TicketSectionStyles>,
  fallback: TicketAlign
): TicketAlign {
  return styles?.[section]?.align ?? fallback;
}

function ticketFeed(feedLines?: number): string {
  return "\n".repeat(Math.max(1, Math.min(8, feedLines ?? 3)));
}

function ticketTopPadding(topPaddingLines?: number): string {
  return "\n".repeat(Math.max(0, Math.min(6, topPaddingLines ?? 0)));
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
    const itemWidth = Math.max(3, width - amount.length - 1);
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
  return `${truncateTicketText(label, Math.max(1, width - amount.length - 1)).padEnd(Math.max(0, width - amount.length))}${amount}`;
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

function sectionLines(text: string | string[], section: TicketSection): TicketLine[] {
  const lines = Array.isArray(text) ? text : [text];
  return lines.map((line) => ({ text: line, section }));
}

function finishTicketLines(lines: TicketLine[], styles: TicketSectionStyles | undefined, topPaddingLines: number | undefined, feedLines: number | undefined, styled: boolean, lineWidthChars?: number, forcePaperWidth = false): string {
  const visibleLines = styled
    ? lines.map((line) => encodePrintStyleLine(line, styles, defaultPrintAlign(line.section)))
    : lines.map((line) => line.text);
  const paper = styled && (forcePaperWidth || lines.some((line) => line.qrImageDataUrl || line.logoImageDataUrl) || Object.values(styles ?? {}).some((style) => style?.sizeLevel !== undefined)) ? `${PRINT_PAPER_MARKER}${ticketWidth(lineWidthChars)}\n` : "";
  return `${paper}${ticketTopPadding(topPaddingLines)}${visibleLines.join("\n")}${ticketFeed(feedLines)}`;
}

function buildKotTicketLines(ticket: KotTicket): TicketLine[] {
  const width = ticketWidth(ticket.lineWidthChars);
  const title = kotTitle(ticket.type);
  const headerAlign = sectionAlign(ticket.sectionStyles, "header", ticket.headerAlign ?? "center");
  const titleAlign = sectionAlign(ticket.sectionStyles, "title", "center");
  const metadataAlign = sectionAlign(ticket.sectionStyles, "metadata", "left");
  const notesAlign = sectionAlign(ticket.sectionStyles, "notes", "left");
  const itemNotesAlign = sectionAlign(ticket.sectionStyles, "itemNotes", "left");
  const footerAlign = sectionAlign(ticket.sectionStyles, "footer", ticket.footerAlign ?? "center");
  const lines = [
    ...(ticket.header ? [...sectionLines(alignTicketText(ticket.header, width, headerAlign), "header"), ...sectionLines(separator(width), "metadata")] : []),
    ...sectionLines(alignTicketText(`${ticket.ticketLabel ?? "KOT"} #${ticket.sequence} ${title}`, width, titleAlign), "title"),
    ...(ticket.reason ? [...sectionLines(alignTicketText(ticket.type === "table_shifted" ? compactShiftReason(ticket.reason) : ticket.reason, width, titleAlign), "title"), ...sectionLines(separator(width), "metadata")] : []),
    ...sectionLines(alignTicketText(`Station: ${ticket.productionUnitName}`, width, metadataAlign), "metadata"),
    ...(ticket.showTable === false ? [] : sectionLines(alignTicketText(`Table: ${ticket.tableName}`, width, metadataAlign), "metadata")),
    ...(ticket.showCaptain === false ? [] : sectionLines(alignTicketText(`Captain: ${ticket.captainId}`, width, metadataAlign), "metadata")),
    ...(ticket.showDateTime === false ? [] : sectionLines(alignTicketText(`Time: ${formatPosDateTime(ticket.createdAt)}`, width, metadataAlign), "metadata")),
    ...sectionLines(separator(width), "metadata"),
    ...(ticket.note?.trim() ? [...sectionLines(alignTicketText(wrapTicketText(`Note: ${ticket.note.trim()}`, width).join("\n"), width, notesAlign), "notes"), ...sectionLines(separator(width), "metadata")] : [])
  ];

  for (const item of ticket.items) {
    const sign = item.quantityDelta > 0 ? "+" : "";
    const quantityText = item.quantityDelta === 0 ? item.name : `${sign}${item.quantityDelta} x ${item.name}`;
    lines.push(...sectionLines(wrapTicketText(quantityText, width), "items"));
    if (item.note?.trim()) {
      lines.push(...sectionLines(alignTicketText(wrapTicketText(item.note.trim(), width).join("\n"), width, itemNotesAlign), "itemNotes"));
    }
  }
  if (ticket.footer) lines.push(...sectionLines(separator(width), "metadata"), ...sectionLines(alignTicketText(ticket.footer, width, footerAlign), "footer"));

  return lines;
}

export function renderKotTicket(ticket: KotTicket): string {
  return finishTicketLines(buildKotTicketLines(ticket), ticket.sectionStyles, ticket.topPaddingLines, ticket.feedLines, false, ticket.lineWidthChars);
}

export function renderKotTicketForPrint(ticket: KotTicket): string {
  return finishTicketLines(buildKotTicketLines(ticket), ticket.sectionStyles, ticket.topPaddingLines, ticket.feedLines, true, ticket.lineWidthChars);
}

function buildBillTicketLines(ticket: BillTicket): TicketLine[] {
  const width = ticketWidth(ticket.lineWidthChars);
  const sectionWidth = (section: TicketSection) => {
    const level = ticket.sectionStyles?.[section]?.sizeLevel;
    return level === undefined ? width : Math.max(12, Math.floor(width / printSizeScale(level)));
  };
  const itemsWidth = sectionWidth("items");
  const totalsWidth = sectionWidth("totals");
  const customerName = ticket.customerName?.trim();
  const restaurantAlign = sectionAlign(ticket.sectionStyles, "restaurantName", ticket.headerAlign ?? "center");
  const addressAlign = sectionAlign(ticket.sectionStyles, "address", ticket.headerAlign ?? "center");
  const headerAlign = sectionAlign(ticket.sectionStyles, "header", ticket.headerAlign ?? "center");
  const titleAlign = sectionAlign(ticket.sectionStyles, "title", "center");
  const metadataAlign = sectionAlign(ticket.sectionStyles, "metadata", "left");
  const footerAlign = sectionAlign(ticket.sectionStyles, "footer", ticket.footerAlign ?? "center");
  const lines = [
    ...(ticket.restaurantLogo ? [{ text: "", section: "restaurantName" as const, logoImageDataUrl: ticket.restaurantLogo.imageDataUrl, logoWidthMm: ticket.restaurantLogo.widthMm }] : []),
    ...(ticket.restaurantName ? sectionLines(alignTicketText(ticket.restaurantName, width, restaurantAlign), "restaurantName") : []),
    ...(ticket.restaurantAddress ? sectionLines(alignTicketText(ticket.restaurantAddress, width, addressAlign), "address") : []),
    ...(ticket.header ? sectionLines(alignTicketText(ticket.header, width, headerAlign), "header") : []),
    ...(ticket.showBillId === false ? [] : sectionLines(alignTicketText(`BILL ${ticket.billId}`, width, titleAlign), "title")),
    ...(customerName ? sectionLines(alignTicketText(wrapTicketText(`Name: ${customerName}`, width).join("\n"), width, metadataAlign), "metadata") : []),
    ...(ticket.showNcReprintRevision === false
      ? []
      : [
          ...(ticket.ncReason ? sectionLines(alignTicketText("NC / NON CUSTOMER", width, titleAlign), "title") : [])
        ]),
    ...(ticket.showTable === false ? [] : sectionLines(alignTicketText(`Table: ${ticket.tableName}`, width, metadataAlign), "metadata")),
    ...(ticket.showDateTime === false ? [] : sectionLines(alignTicketText(`Date: ${formatPosDateTime(ticket.createdAt)}`, width, metadataAlign), "metadata")),
    ...(ticket.taxRegistrationText ? sectionLines(alignTicketText(ticket.taxRegistrationText, width, metadataAlign), "metadata") : []),
    ...sectionLines(separator(width), "metadata"),
    ...(ticket.items?.length
	      ? [
	          ...sectionLines(itemsWidth < 32 ? `${"Item".padEnd(Math.max(4, itemsWidth - 7))} ${right("Amt", 6)}` : `${"Item".padEnd(Math.max(8, itemsWidth - 25))} ${right("Qty", 4)} ${right("Rate", 8)} ${right("Amt", 9)}`, "items"),
          ...sectionLines(separator(width), "metadata"),
          ...sectionLines(ticket.items.flatMap((item) => renderBillItemLines(item, itemsWidth)), "items"),
          ...sectionLines(separator(width), "metadata")
        ]
      : []),
    ...sectionLines(renderMoneyLine("Subtotal", ticket.subtotalPaise, totalsWidth), "totals"),
    ...(ticket.taxBreakdown?.length
      ? ticket.showTaxBreakup === false
        ? sectionLines(renderTaxLine("Tax", ticket.taxPaise, totalsWidth), "totals")
        : sectionLines(ticket.taxBreakdown.map((line) => renderTaxLine(line.name, line.amountPaise, totalsWidth, line.rateBps)), "totals")
      : ticket.taxPaise > 0
        ? sectionLines(renderTaxLine("Tax", ticket.taxPaise, totalsWidth), "totals")
        : []),
    ...sectionLines(renderMoneyLine("Total", ticket.totalPaise, totalsWidth), "totals")
  ];

  if (ticket.showDiscountTip !== false && ticket.discountPaise) lines.push(...sectionLines(renderMoneyLine("Discount", -ticket.discountPaise, totalsWidth), "totals"));
  if (ticket.showDiscountTip !== false && ticket.tipPaise) lines.push(...sectionLines(renderMoneyLine("Tip", ticket.tipPaise, totalsWidth), "totals"));
  if (ticket.finalTotalPaise && ticket.finalTotalPaise !== ticket.totalPaise) {
    lines.push(...sectionLines(renderMoneyLine("Final", ticket.finalTotalPaise, totalsWidth), "totals"));
  }
  if (ticket.showPaymentSplit !== false && ticket.payments?.length) {
    lines.push(
      ...sectionLines(separator(width), "metadata"),
      ...sectionLines("Payments", "metadata"),
      ...sectionLines(ticket.payments.map((payment) => renderMoneyLine(payment.method.toUpperCase(), payment.amountPaise, totalsWidth)), "totals")
    );
  }
  if (ticket.showNcReprintRevision !== false && ticket.ncReason) lines.push(...sectionLines(`NC Reason: ${ticket.ncReason}`, "metadata"));

  if (ticket.paymentQr) {
    lines.push(...sectionLines(separator(width), "metadata"), ...sectionLines(alignTicketText("Scan to pay", width, "center"), "footer"), { text: "", section: "footer", qrImageDataUrl: ticket.paymentQr.imageDataUrl, qrSizeMm: ticket.paymentQr.sizeMm });
  }

  if (ticket.footer) lines.push(...sectionLines(separator(width), "metadata"), ...sectionLines(alignTicketText(ticket.footer, width, footerAlign), "footer"));

  return lines;
}

export function renderBillTicket(ticket: BillTicket): string {
  return finishTicketLines(buildBillTicketLines(ticket), ticket.sectionStyles, ticket.topPaddingLines, ticket.feedLines, false, ticket.lineWidthChars);
}

export function renderBillTicketForPrint(ticket: BillTicket): string {
  return finishTicketLines(buildBillTicketLines(ticket), ticket.sectionStyles, ticket.topPaddingLines, ticket.feedLines, true, ticket.lineWidthChars, ticket.paperWidthMm !== undefined);
}
