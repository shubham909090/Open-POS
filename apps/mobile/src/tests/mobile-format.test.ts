import { describe, expect, it } from "vitest";

import {
  amountInputToPaise,
  approvalPayload,
  categoryToneFor,
  createOperationKey,
  findMenuVariant,
  formatRupees,
  isValidAmountInput,
  normaliseHubUrl,
  normalisePax,
  paiseToRupeeInput,
  parsePairingPayload,
  stableStringify
} from "../lib/mobile-format";

describe("mobile UI formatting helpers", () => {
  it("formats rupees and paise for compact restaurant UI labels", () => {
    expect(formatRupees(12000)).toBe("120");
    expect(formatRupees(12050)).toBe("120.50");
    expect(formatRupees(644000)).toBe("6,440");
    expect(formatRupees(10000050)).toBe("1,00,000.50");
    expect(paiseToRupeeInput(10000050)).toBe("100000.50");
    expect(amountInputToPaise(paiseToRupeeInput(10000050))).toBe(10000050);
    expect(paiseToRupeeInput(9900)).toBe("99");
    expect(paiseToRupeeInput(9999)).toBe("99.99");
    expect(amountInputToPaise("12.345")).toBe(1235);
    expect(amountInputToPaise("-12")).toBe(0);
  });

  it("normalises pairing inputs from QR/manual setup", () => {
    expect(normaliseHubUrl("192.168.1.10:3737/")).toBe("http://192.168.1.10:3737");
    expect(normaliseHubUrl("")).toBe("http://192.168.1.10:3737");
    expect(normalisePax("0")).toBe(1);
    expect(normalisePax("4")).toBe(4);

    const payload = parsePairingPayload(JSON.stringify({ kind: "gaurav-pos-pairing", version: 1, hubUrl: "http://hub", code: "123456" }));
    expect(payload?.code).toBe("123456");
    expect(parsePairingPayload("123456")).toBeNull();
    expect(parsePairingPayload("not-json")).toBeNull();
  });

  it("keeps stable operation keys and category tones deterministic", () => {
    expect(createOperationKey("submit")).toMatch(/^submit-/);
    expect(stableStringify({ b: 2, a: 1 })).toBe("{\"b\":2,\"a\":1}");
    expect(categoryToneFor("beverage")).toMatchObject({ icon: "B" });
    expect(categoryToneFor()).toMatchObject({ icon: "M" });
    expect(approvalPayload(" 1234 ", " Comp ", "")).toEqual({
      managerApproval: { pin: "1234", reason: "Comp", approvedBy: "Captain app" }
    });
    expect(findMenuVariant(undefined, "missing")).toBeUndefined();
  });
});

it("validates raw money before committing without interpreting malformed values as zero", () => {
  for (const value of ["", "0", "1000", "1000.50", ".50", "12."]) expect(isValidAmountInput(value)).toBe(true);
  for (const value of ["1..2", ".", "12.345", "NaN", "Infinity", "-1"]) expect(isValidAmountInput(value)).toBe(false);
});
