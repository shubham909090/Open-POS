import { describe, expect, it } from "vitest";
import { getAndroidStatusBarTopInset } from "../lib/safe-area";

describe("mobile safe area sizing", () => {
  it("reserves Android status bar space before rendering the app header", () => {
    expect(getAndroidStatusBarTopInset("android", 28)).toBe(28);
  });

  it("does not add synthetic top padding when the platform has its own safe area", () => {
    expect(getAndroidStatusBarTopInset("ios", 28)).toBe(0);
  });

  it("keeps a fallback Android top inset when Expo does not report one", () => {
    expect(getAndroidStatusBarTopInset("android")).toBe(24);
  });
});
