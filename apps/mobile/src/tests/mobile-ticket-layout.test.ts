import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("mobile ticket layout", () => {
  it("keeps order item names readable beside captain controls on narrow phones", () => {
    const ticketStyles = readFileSync(fileURLToPath(new URL("../styles/menu-ticket-styles.ts", import.meta.url)), "utf8");
    const serviceStyles = readFileSync(fileURLToPath(new URL("../styles/service-workflow-styles.ts", import.meta.url)), "utf8");

    expect(ticketStyles).toMatch(/ticketText:\s*\{[^}]*minWidth:\s*160[^}]*flexShrink:\s*1/s);
    expect(ticketStyles).toMatch(/sentName:\s*\{[^}]*minWidth:\s*150[^}]*flexShrink:\s*1/s);
    expect(ticketStyles).toMatch(/qtyControls:\s*\{[^}]*flexShrink:\s*0/s);
    expect(serviceStyles).toMatch(/itemShiftRow:\s*\{[^}]*flexWrap:\s*"wrap"/s);
  });
});
