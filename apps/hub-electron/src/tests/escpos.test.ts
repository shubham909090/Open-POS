import { describe, expect, it } from "vitest";
import { buildWindowsSystemPrintCommand, renderEscposPayload } from "../printing/escpos.js";

describe("ESC/POS print payload", () => {
  it("keeps LAN printer payload compatible with raw thermal printers before cutting", () => {
    const payload = renderEscposPayload("KOT #1\n+2 Dal Fry\n");

    expect([...payload.subarray(0, 5)]).toEqual([
      0x1b, 0x40,
      0x1b, 0x61, 0x00
    ]);
    expect(payload.includes(Buffer.from("KOT #1\n+2 Dal Fry\n", "utf8"))).toBe(true);
    expect([...payload.subarray(-6)]).toEqual([
      0x1b, 0x61, 0x00,
      0x1d, 0x56, 0x00
    ]);
  });

  it("uses larger regular text for Windows system ticket printing", () => {
    const command = buildWindowsSystemPrintCommand("C:\\temp\\ticket.txt", "Cash Printer").join(" ");

    expect(command).toContain("Consolas");
    expect(command).toContain(", 11, [System.Drawing.FontStyle]::Regular");
    expect(command).not.toContain("FontStyle]::Bold");
  });
});
