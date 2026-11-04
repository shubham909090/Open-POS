// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoticeSetter } from "../renderer/lib/format.js";
import { useHubStore } from "../renderer/store.js";

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
    useHubStore.setState({ drafts: {} });
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

  it("blocks unsent local items even with zero server orders and enables update after they are cleared", async () => {
    updateStatusMock.mockResolvedValue(updateStatus({ activeOrderCount: 0 }));
    installOnlineUpdateMock.mockResolvedValue({ status: "up_to_date", currentVersion: "0.1.0" });
    useHubStore.setState({ drafts: unsentDraft() });
    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel);
    await screen.findByText("App 0.1.0 · DB 10");
    const button = screen.getByRole("button", { name: "Update app" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Send or discard unsent items before updating/)).toBeTruthy();
    fireEvent.click(button);
    expect(installOnlineUpdateMock).not.toHaveBeenCalled();
    act(() => useHubStore.getState().clearDraft("table-t1"));
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(installOnlineUpdateMock).toHaveBeenCalledTimes(1));
  });

  it("rechecks drafts in the action preflight instead of trusting the last button render", async () => {
    updateStatusMock.mockResolvedValue(updateStatus());
    const setNotice = vi.fn();
    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel, { setNotice });
    await screen.findByText("App 0.1.0 · DB 10");
    const current = useHubStore.getState();
    vi.spyOn(useHubStore, "getState").mockReturnValue({ ...current, drafts: unsentDraft() });
    fireEvent.click(screen.getByRole("button", { name: "Update app" }));
    expect(installOnlineUpdateMock).not.toHaveBeenCalled();
    expect(setNotice).toHaveBeenCalledWith({ tone: "bad", text: "Send or discard unsent items before updating." });
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

function unsentDraft() {
  return { "table-t1": { line: { lineKey: "line", menuItemId: "dish-1", name: "Dal", pricePaise: 18000, quantity: 2 } } };
}

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
