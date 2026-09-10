import { describe, expect, it } from "vitest";
import { decodeCsvFile } from "../renderer/components/ui/csv-import-box.js";

describe("CSV file decoding", () => {
  it("falls back to Windows-1252 for CSV files saved by older Excel versions", async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("name,price\r\nCr"),
      0xe8,
      ...new TextEncoder().encode("me Of Broccoli,180\r\n")
    ]);
    const file = new File([bytes], "menu.csv", { type: "text/csv" });

    await expect(decodeCsvFile(file)).resolves.toContain("Crème Of Broccoli");
  });
});
