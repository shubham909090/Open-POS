import { describe, expect, it } from "vitest";
import { PRINT_STYLE_MARKER } from "../domain/tickets.js";
import { buildWindowsSystemPrintCommand, renderEscposPayload } from "../printing/escpos.js";

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
  });

  it("applies styled ticket directives to ESC/POS payload", () => {
    const payload = renderEscposPayload(`${PRINT_STYLE_MARKER}large:1:center|KOT #1\n${PRINT_STYLE_MARKER}normal:0:left|+2 Dal Fry\n`);

    expect(payload.includes(Buffer.from([0x1b, 0x61, 0x01]))).toBe(true);
    expect(payload.includes(Buffer.from([0x1b, 0x45, 0x01]))).toBe(true);
    expect(payload.includes(Buffer.from([0x1d, 0x21, 0x11]))).toBe(true);
    expect(payload.includes(Buffer.from("KOT #1", "utf8"))).toBe(true);
  });
});
