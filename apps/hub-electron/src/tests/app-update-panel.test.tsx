// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoticeSetter } from "../renderer/lib/format.js";

const mocks = vi.hoisted(() => ({
  updateStatusMock: vi.fn(),
  installOnlineUpdateMock: vi.fn()
}));
const { updateStatusMock, installOnlineUpdateMock } = mocks;

vi.mock("../renderer/hub-api.js", () => ({
  hubApi: {
    updateStatus: updateStatusMock,
    installOnlineUpdate: installOnlineUpdateMock
  }
}));

describe("AppUpdatePanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete window.gauravPos;
  });

  it("runs the online update from one primary button without local package setup", async () => {
    updateStatusMock.mockResolvedValue(updateStatus());
    installOnlineUpdateMock.mockResolvedValue({
      installing: true,
      backup: { fileName: "pre-update.sqlite" },
      version: "0.2.0"
    });
    const setNotice = vi.fn();

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel, { setNotice });

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    expect(screen.getByText("First update creates DB backup only")).toBeTruthy();
    expect(screen.queryByText("Choose package")).toBeNull();
    expect(screen.queryByText("Register package baseline")).toBeNull();
    expect(screen.queryByText("Register current installer baseline")).toBeNull();
    expect(screen.queryByText("Validate")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Update app" }));

    await waitFor(() => expect(installOnlineUpdateMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(setNotice).toHaveBeenCalledWith({
        tone: "good",
        text: "Update downloaded. Backup created: pre-update.sqlite. Installing now."
      })
    );
  });

  it("does not start an online update while orders are running", async () => {
    updateStatusMock.mockResolvedValue(updateStatus({ activeOrderCount: 2 }));
    const setNotice = vi.fn();

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel, { setNotice });

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update app" }));

    await waitFor(() =>
      expect(setNotice).toHaveBeenCalledWith({
        tone: "bad",
        text: "Close or settle 2 running order(s) before updating."
      })
    );
    expect(installOnlineUpdateMock).not.toHaveBeenCalled();
  });

  it("shows when the online updater reports the app is already current", async () => {
    updateStatusMock.mockResolvedValue(updateStatus());
    installOnlineUpdateMock.mockResolvedValue({ status: "up_to_date", currentVersion: "0.1.0" });
    const setNotice = vi.fn();

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel, { setNotice });

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update app" }));

    await waitFor(() => expect(setNotice).toHaveBeenCalledWith({ tone: "good", text: "Hub is up to date: 0.1.0" }));
  });

  it("shows exact online update errors", async () => {
    updateStatusMock.mockResolvedValue(updateStatus());
    installOnlineUpdateMock.mockRejectedValue(new Error("GitHub update feed unavailable"));
    const setNotice = vi.fn();

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel, { setNotice });

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update app" }));

    await waitFor(() => expect(setNotice).toHaveBeenCalledWith({ tone: "bad", text: "GitHub update feed unavailable" }));
  });
});

function renderAppUpdatePanel(
  AppUpdatePanel: ComponentType<{
    setNotice: NoticeSetter;
  }>,
  options: {
    setNotice?: NoticeSetter;
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppUpdatePanel setNotice={options.setNotice ?? vi.fn()} />
    </QueryClientProvider>
  );
}

function updateStatus(overrides: { activeOrderCount?: number } = {}) {
  return {
    appVersion: "0.1.0",
    dbSchemaVersion: 10,
    activeOrderCount: overrides.activeOrderCount ?? 0,
    baselineRegistered: false,
    rollbackAvailable: false,
    online: {
      enabled: true,
      status: "idle",
      currentVersion: "0.1.0",
      availableVersion: null,
      downloadPercent: null,
      message: null,
      checkedAt: null
    }
  };
}
