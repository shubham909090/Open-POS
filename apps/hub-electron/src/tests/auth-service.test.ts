import { describe, expect, it } from "vitest";
import { createTestHub } from "./helpers.js";

describe("AuthService local device sessions", () => {
  it("authenticates the seeded admin token", () => {
    const { authService, database } = createTestHub();

    expect(authService.authenticate("test-admin-token")).toMatchObject({
      id: "device-local-admin",
      role: "admin"
    });

    database.close();
  });

  it("exchanges a pairing code once and rejects reuse", () => {
    const { authService, database } = createTestHub();

    const pairing = authService.createPairingCode({
      deviceName: "Waiter phone",
      role: "waiter",
      expiresInMinutes: 10
    });
    const device = authService.exchangePairingCode({
      code: pairing.code,
      deviceName: "Waiter phone 1"
    });

    expect(device.role).toBe("waiter");
    expect(authService.authenticate(device.token)).toMatchObject({ role: "waiter" });
    expect(() =>
      authService.exchangePairingCode({
        code: pairing.code,
        deviceName: "Waiter phone 2"
      })
    ).toThrow("Pairing code is invalid");

    database.close();
  });

  it("revokes paired devices", () => {
    const { authService, database } = createTestHub();
    const pairing = authService.createPairingCode({
      deviceName: "Kitchen screen",
      role: "kitchen",
      expiresInMinutes: 10
    });
    const device = authService.exchangePairingCode({
      code: pairing.code,
      deviceName: "Kitchen screen"
    });

    authService.revokeDevice(device.deviceId, {});

    expect(() => authService.authenticate(device.token)).toThrow("Invalid or revoked device token");

    database.close();
  });
});
