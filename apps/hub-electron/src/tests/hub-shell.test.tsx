// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("Hub shell PIN flow", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("shows only the first-run Manager PIN setup when no PIN exists", async () => {
    const { App } = await importAppWithSession({ managerPinConfigured: false });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Create Manager PIN" })).toBeTruthy();
    expect(screen.getByLabelText("Manager PIN")).toBeTruthy();
    expect(screen.queryByText("Gaurav POS")).toBeNull();
    expect(screen.queryByRole("button", { name: "Unlock setup" })).toBeNull();
  });

  it("keeps the locked side rail as a button until the user opens the unlock modal", async () => {
    const { App } = await importAppWithSession({ managerPinConfigured: true });

    render(<App />);

    expect(await screen.findByRole("button", { name: "Unlock setup" })).toBeTruthy();
    expect(screen.queryByLabelText("Manager PIN")).toBeNull();

    screen.getByRole("button", { name: "Unlock setup" }).click();

    await waitFor(() => expect(screen.getByLabelText("Manager PIN")).toBeTruthy());
  });
});

async function importAppWithSession(options: { managerPinConfigured: boolean }) {
  vi.doMock("../renderer/hub-api.js", () => ({
    clearAuthToken: vi.fn(),
    setAuthToken: vi.fn(),
    hubApi: {
      adminSessionStatus: vi.fn().mockResolvedValue({ managerPinConfigured: options.managerPinConfigured }),
      bootstrap: vi.fn().mockRejectedValue(new Error("Setup is locked")),
      setManagerPin: vi.fn().mockResolvedValue({ managerPinConfigured: true }),
      unlockAdminSession: vi.fn().mockResolvedValue({ token: "admin-session-token" }),
      lockAdminSession: vi.fn().mockResolvedValue({ locked: true })
    }
  }));
  const module = await import("../renderer/App.js");
  return { App: module.default };
}
