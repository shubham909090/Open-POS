import { createCanvas } from "@napi-rs/canvas";
import { printSizeScale, printPaperDotsForChars, renderLogoBitmap } from "@gaurav-pos/shared";
import { PNG } from "pngjs";
import { deflateSync } from "node:zlib";
import { parsePrintStyleLine, type ParsedPrintStyleLine } from "../domain/tickets.js";

export interface TicketBitmap { width: number; height: number; data: Uint8Array | Uint8ClampedArray }

export function ticketPaperDots(payload: string): number {
  const chars = payload.split(/\r?\n/).map(parsePrintStyleLine).find((line) => line?.paperWidthChars)?.paperWidthChars ?? 32;
  return printPaperDotsForChars(chars);
}

export function qrBitmap(line: ParsedPrintStyleLine, paperDots: number): TicketBitmap {
  const png = PNG.sync.read(Buffer.from(line.qrImageDataUrl!.split(",")[1]!, "base64"), { checkCRC: true });
  // Uploads are normalized to eight pixels per module, including four quiet
  // modules on each edge. Keep every printed module equally wide. Very dense
  // codes need at least two thermal dots per module even at the smallest size.
  const modules = png.width / 8;
  const availableDots = paperDots - 16;
  if (!Number.isInteger(modules) || modules * 2 > availableDots) throw new Error("This payment QR is too detailed for the selected paper width. Upload a simpler reusable QR.");
  const dotsPerModule = Math.min(Math.floor(availableDots / modules), Math.max(2, Math.floor((line.qrSizeMm ?? 32) * 203 / 25.4 / modules)));
  const side = modules * dotsPerModule;
  const data = new Uint8Array(paperDots * side * 4).fill(255);
  const left = Math.floor((paperDots - side) / 2);
  // Integer scaling retains sharp, equally sized modules and the quiet zone.
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const source = (Math.min(png.height - 1, Math.floor(y * png.height / side)) * png.width + Math.min(png.width - 1, Math.floor(x * png.width / side))) * 4;
    const target = (y * paperDots + x + left) * 4;
    data[target] = png.data[source]!;
    data[target + 1] = png.data[source + 1]!;
    data[target + 2] = png.data[source + 2]!;
  }
  return { width: paperDots, height: side, data };
}

export function logoBitmap(line: ParsedPrintStyleLine, paperDots: number): TicketBitmap {
  const png = PNG.sync.read(Buffer.from(line.logoImageDataUrl!.split(",")[1]!, "base64"), { checkCRC: true });
  return renderLogoBitmap(png, paperDots, {
    logoWidthMm: line.logoWidthMm,
    logoThreshold: line.logoThreshold,
    logoPrintMode: line.logoPrintMode
  });
}

export function textBitmap(line: ParsedPrintStyleLine, paperDots: number): TicketBitmap {
  const scale = line.sizeLevel === undefined ? line.size === "large" ? 2 : line.size === "small" ? 0.75 : 1 : printSizeScale(line.sizeLevel);
  const fontSize = 20 * scale;
  const lineHeight = Math.ceil(26 * scale);
  const measure = createCanvas(1, 1).getContext("2d");
  measure.font = `${line.bold ? "bold " : ""}${fontSize}px monospace`;
  const rows: string[] = [];
  let current = "";
  for (const char of line.text) {
    if (current && measure.measureText(current + char).width > paperDots - 2) { rows.push(current); current = ""; }
    current += char;
  }
  rows.push(current);
  const canvas = createCanvas(paperDots, Math.max(1, rows.length * lineHeight));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black"; ctx.font = measure.font; ctx.textBaseline = "top";
  ctx.textAlign = line.align;
  const x = line.align === "center" ? paperDots / 2 : line.align === "right" ? paperDots - 1 : 1;
  if (line.graphicLine) ctx.fillRect(0, Math.floor(lineHeight / 2), paperDots, 1);
  else rows.forEach((row, i) => ctx.fillText(row, x, i * lineHeight + 2));
  return { width: paperDots, height: canvas.height, data: ctx.getImageData(0, 0, paperDots, canvas.height).data };
}

export function bitmapEscpos(bitmap: TicketBitmap): Buffer {
  const bytesWide = Math.ceil(bitmap.width / 8);
  const chunks: Buffer[] = [Buffer.from([0x1b, 0x61, 0, 0x1d, 0x21, 0])];
  // Small bands stay within older thermal printers' raster-buffer limits.
  for (let top = 0; top < bitmap.height; top += 128) {
    const height = Math.min(128, bitmap.height - top);
    const pixels = Buffer.alloc(bytesWide * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < bitmap.width; x++) {
      const i = ((top + y) * bitmap.width + x) * 4;
      if (bitmap.data[i]! * 0.299 + bitmap.data[i + 1]! * 0.587 + bitmap.data[i + 2]! * 0.114 < 160 && bitmap.data[i + 3]! > 128) pixels[y * bytesWide + (x >> 3)]! |= 0x80 >> (x & 7);
    }
    chunks.push(Buffer.from([0x1d, 0x76, 0x30, 0, bytesWide & 255, bytesWide >> 8, height & 255, height >> 8]), pixels);
  }
  return Buffer.concat(chunks);
}

/** A physical-size PDF lets CUPS keep the QR and gradual fonts on macOS/Linux. */
export function renderTicketPdf(payload: string): { data: Buffer; widthMm: number; heightMm: number } {
  const width = ticketPaperDots(payload);
  const rows = payload.split(/\r?\n/).flatMap((text) => {
    const parsed = parsePrintStyleLine(text);
    if (parsed?.paperWidthChars) return [];
    const line = parsed ?? { text, plainText: text, size: "normal" as const, bold: false, align: "left" as const };
    return [line.logoImageDataUrl ? logoBitmap(line, width) : line.qrImageDataUrl ? qrBitmap(line, width) : textBitmap(line, width)];
  });
  const height = Math.max(1, rows.reduce((sum, row) => sum + row.height, 0));
  const rgb = Buffer.alloc(width * height * 3, 255);
  let offset = 0;
  for (const row of rows) {
    for (let p = 0; p < row.width * row.height; p++) {
      rgb[(offset + p) * 3] = row.data[p * 4]!;
      rgb[(offset + p) * 3 + 1] = row.data[p * 4 + 1]!;
      rgb[(offset + p) * 3 + 2] = row.data[p * 4 + 2]!;
    }
    offset += row.width * row.height;
  }
  const wPt = width * 72 / 203, hPt = height * 72 / 203;
  const pixels = deflateSync(rgb);
  const content = Buffer.from(`q ${wPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q`);
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Interpolate false /Length ${pixels.length} >>\nstream\n`), pixels, Buffer.from("\nendstream")]),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")])
  ];
  const chunks = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  let length = chunks[0]!.length;
  objects.forEach((object, i) => { offsets.push(length); const block = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]); chunks.push(block); length += block.length; });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return { data: Buffer.concat(chunks), widthMm: width * 25.4 / 203, heightMm: height * 25.4 / 203 };
}
