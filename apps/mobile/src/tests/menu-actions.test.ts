import { describe, expect, it } from "vitest";
import { formatMobileMenuActionLabel } from "../lib/menu-actions";

describe("mobile compact menu actions", () => {
  it("formats default add actions without Add wording", () => {
    expect(formatMobileMenuActionLabel({ kind: "default", pricePaise: 20_000 })).toBe("+ ₹200");
  });

  it("formats liquor variants as compact one-line labels", () => {
    expect(formatMobileMenuActionLabel({ kind: "shot", label: "30 ml", pricePaise: 4_000 })).toBe("30 ml ₹40");
    expect(formatMobileMenuActionLabel({ kind: "large_bottle", label: "750 ml", pricePaise: 90_000 })).toBe("750 ml ₹900");
    expect(formatMobileMenuActionLabel({ kind: "large_bottle", label: "750 ml", pricePaise: 210_000 })).toBe("750 ml ₹2,100");
  });
});
