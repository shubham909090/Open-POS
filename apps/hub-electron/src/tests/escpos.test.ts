import { describe, expect, it } from "vitest";
import { PRINT_LINE_MARKER, PRINT_STYLE_MARKER } from "../domain/tickets.js";
import { buildWindowsSystemPrintCommand, renderEscposPayload } from "../printing/escpos.js";
import { PRINT_PAPER_MARKER, PRINT_QR_MARKER, parsePrintStyleLine } from "../domain/tickets.js";
import { qrBitmap, renderTicketPdf, textBitmap } from "../printing/ticket-raster.js";
import QRCode from "qrcode";
import { createRequire } from "node:module";
const jsQR = createRequire(import.meta.url)("jsqr") as typeof import("jsqr").default;

describe("ESC/POS print payload", () => {
  it("keeps LAN printer payload compatible with raw thermal printers before cutting", () => {
    const payload = renderEscposPayload("KOT #1\n+2 Dal Fry\n");

    expect([...payload.subarray(0, 5)]).toEqual([
      0x1b, 0x40,
      0x1b, 0x61, 0x00
    ]);
    expect(payload.includes(Buffer.from("KOT #1", "utf8"))).toBe(true);
    expect(payload.includes(Buffer.from("+2 Dal Fry", "utf8"))).toBe(true);
    expect([...payload.subarray(-6)]).toEqual([
      0x1b, 0x61, 0x00,
      0x1d, 0x56, 0x00
    ]);
  });

  it("uses larger regular text for Windows system ticket printing", () => {
    const command = buildWindowsSystemPrintCommand("C:\\temp\\ticket.txt", "Cash Printer").join(" ");

    expect(command).toContain("Consolas");
    expect(command).toContain("$fontSize = if ($parsed.Size -eq 'large') { 14 } elseif ($parsed.Size -eq 'small') { 9 } else { 11 }");
    expect(command).toContain("$fontStyle = if ($parsed.Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }");
    expect(command).toContain("MeasureString($parsed.Text, $font)");
    expect(command).toContain("$plainMarker = [char]31");
    expect(command).toContain("$lines[$lines.Length - 1] -eq ''");
    expect(command).toContain("$plainBar = $payload.IndexOf([string]$plainMarker)");
    expect(command).toContain("$payload = $payload.Substring(0, $plainBar)");
    expect(command).toContain("DrawLine([System.Drawing.Pens]::Black");
    expect(command).toContain("$lineMarker = [char]29 + 'line:'");
    expect(command).not.toContain(JSON.stringify(PRINT_LINE_MARKER));
  });

  it("applies styled ticket directives to ESC/POS payload", () => {
    const payload = renderEscposPayload(`${PRINT_STYLE_MARKER}large:1:center|KOT #1\n${PRINT_STYLE_MARKER}normal:0:left|+2 Dal Fry\n`);

    expect(payload.includes(Buffer.from([0x1b, 0x61, 0x01]))).toBe(true);
    expect(payload.includes(Buffer.from([0x1b, 0x45, 0x01]))).toBe(true);
    expect(payload.includes(Buffer.from([0x1d, 0x21, 0x11]))).toBe(true);
    expect(payload.includes(Buffer.from("KOT #1", "utf8"))).toBe(true);
  });

  it("falls back to plain solid text lines for raw ESC/POS printers", () => {
    const payload = renderEscposPayload(`${PRINT_LINE_MARKER}8\u001f________\n`);

    expect(payload.includes(Buffer.from("________", "utf8"))).toBe(true);
  });

  it("renders all eleven numeric sizes at distinct, increasing heights", () => {
    const heights = Array.from({ length: 11 }, (_, level) => textBitmap({ text: "Total 123.45", plainText: "Total 123.45", size: "normal", sizeLevel: level, bold: false, align: "left" }, 576).height);
    expect(new Set(heights).size).toBe(11);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    const payload = renderEscposPayload(`${PRINT_PAPER_MARKER}28\n${PRINT_STYLE_MARKER}normal:1:left:3|Total 123.45\n`);
    expect(payload.includes(Buffer.from([0x1d, 0x76, 0x30, 0]))).toBe(true);
    expect(payload.includes(Buffer.from([0x1d, 0x21, 0x11]))).toBe(false);
  });

  it("prints a scannable QR with quiet zone at the requested physical size", async () => {
    const uri = "upi://pay?pa=restaurant@upi&pn=Restaurant&cu=INR";
    const image = await QRCode.toDataURL(uri, { scale: 8, margin: 4, errorCorrectionLevel: "M" });
    const parsed = parsePrintStyleLine(`${PRINT_QR_MARKER}32:${image}`)!;
    const bitmap = qrBitmap(parsed, 360);
    expect(bitmap.height).toBeLessThanOrEqual(Math.round(32 * 203 / 25.4));
    expect(jsQR(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height)?.data).toBe(uri);
    const payload = `${PRINT_PAPER_MARKER}28\n${PRINT_QR_MARKER}32:${image}\n`;
    expect(renderEscposPayload(payload).includes(Buffer.from([0x1d, 0x76, 0x30, 0]))).toBe(true);
    const pdf = renderTicketPdf(payload);
    expect(pdf.data.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.widthMm).toBeCloseTo(360 * 25.4 / 203);
    expect(pdf.data.includes(Buffer.from("/Interpolate false"))).toBe(true);
    expect(qrBitmap({ ...parsed, qrSizeMm: 45 }, 320).height).toBeLessThan(320);
  });

  it("keeps signed merchant QR modules aligned and scannable on narrow paper", async () => {
    for (const length of [200, 1000, 1800]) {
      const uri = `upi://pay?pa=restaurant@okaxis&pn=Restaurant&sign=${"X".repeat(length)}`;
      const image = await QRCode.toDataURL(uri, { scale: 8, margin: 4, errorCorrectionLevel: "M" });
      for (const size of [20, 32, 45]) {
        const bitmap = qrBitmap(parsePrintStyleLine(`${PRINT_QR_MARKER}${size}:${image}`)!, 320);
        expect(jsQR(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height)?.data).toBe(uri);
        expect(bitmap.height).toBeLessThanOrEqual(304);
      }
    }
  });
});
