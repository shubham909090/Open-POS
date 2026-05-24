import { describe, expect, it } from "vitest";
import { addDaysUtc, addMonthsUtc, isBackupDomain, normalizeSetupKey, sha256Hex } from "./backupModel";

describe("backup/license model helpers", () => {
  it("normalizes setup keys before hashing or lookup", () => {
    expect(normalizeSetupKey(" gav-abcd \n ef12-3456 ")).toBe("GAV-ABCDEF12-3456");
  });

  it("rejects unknown cloud backup domains", () => {
    expect(isBackupDomain("orders")).toBe(true);
    expect(isBackupDomain("syncedEvents")).toBe(false);
    expect(isBackupDomain("dailyReports")).toBe(false);
  });

  it("keeps license lease date math in UTC", () => {
    expect(addDaysUtc("2026-05-24T00:00:00.000Z", 30)).toBe("2026-06-23T00:00:00.000Z");
    expect(addMonthsUtc("2026-05-24T00:00:00.000Z", 1)).toBe("2026-06-24T00:00:00.000Z");
  });

  it("hashes setup keys deterministically", async () => {
    await expect(sha256Hex("GAV-KEY")).resolves.toBe(await sha256Hex("GAV-KEY"));
  });
});
