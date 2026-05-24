import { describe, expect, it } from "vitest";
import { selectCommandCenterActivation } from "./license";

describe("license command center helpers", () => {
  it("keeps suspended activations visible for admin actions", () => {
    const activation = selectCommandCenterActivation([
      { _id: "old-reset", status: "reset", activatedAt: "2026-05-22T00:00:00.000Z" },
      { _id: "current-suspended", status: "suspended", activatedAt: "2026-05-23T00:00:00.000Z" }
    ]);

    expect(activation?._id).toBe("current-suspended");
  });
});
