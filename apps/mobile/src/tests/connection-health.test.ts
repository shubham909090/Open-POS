import { describe, expect, it } from "vitest";
import { nextConnectionAfterRefresh } from "../lib/connection-health";

describe("mobile connection health", () => {
  it("does not flip a loaded phone offline after one silent network miss", () => {
    expect(
      nextConnectionAfterRefresh({
        success: false,
        previous: "online",
        failures: 0,
        hasBootstrap: true,
        showSpinner: false
      })
    ).toEqual({ connection: "online", failures: 1, shouldShowOfflineMessage: false });
  });

  it("marks offline after repeated misses or when no hub truth has loaded yet", () => {
    expect(
      nextConnectionAfterRefresh({
        success: false,
        previous: "online",
        failures: 1,
        hasBootstrap: true,
        showSpinner: false
      }).connection
    ).toBe("offline");
    expect(
      nextConnectionAfterRefresh({
        success: false,
        previous: "checking",
        failures: 0,
        hasBootstrap: false,
        showSpinner: true
      }).connection
    ).toBe("offline");
  });

  it("resets failures after a successful refresh", () => {
    expect(
      nextConnectionAfterRefresh({
        success: true,
        previous: "offline",
        failures: 3,
        hasBootstrap: true,
        showSpinner: false
      })
    ).toEqual({ connection: "online", failures: 0, shouldShowOfflineMessage: false });
  });
});

