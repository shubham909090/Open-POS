// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagerApprovalRequest } from "../renderer/hooks/use-manager-approval.js";
import type { NoticeSetter } from "../renderer/lib/format.js";

const mocks = vi.hoisted(() => ({
  updateStatusMock: vi.fn(),
  validateUpdatePackageMock: vi.fn(),
  registerUpdateBaselineMock: vi.fn(),
  registerInstallerBaselineMock: vi.fn(),
  installUpdateMock: vi.fn(),
  rollbackUpdateMock: vi.fn()
}));
const { updateStatusMock, validateUpdatePackageMock, registerUpdateBaselineMock, registerInstallerBaselineMock, installUpdateMock, rollbackUpdateMock } = mocks;

vi.mock("../renderer/hub-api.js", () => ({
  hubApi: {
    updateStatus: updateStatusMock,
    validateUpdatePackage: validateUpdatePackageMock,
    registerUpdateBaseline: registerUpdateBaselineMock,
    registerInstallerBaseline: registerInstallerBaselineMock,
    installUpdate: installUpdateMock,
    rollbackUpdate: rollbackUpdateMock
  }
}));

describe("AppUpdatePanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete window.gauravPos;
  });

  it("opens the package picker from Install update when no package path is selected", async () => {
    updateStatusMock.mockResolvedValue(updateStatus({ baselineRegistered: true }));
    installUpdateMock.mockResolvedValue({
      installing: true,
      backup: { fileName: "pre-update.sqlite" },
      package: {},
      recoveryScriptPath: "recovery.cmd"
    });
    const chooseUpdatePackage = vi.fn().mockResolvedValue("C:\\updates\\Gaurav POS Hub.gpos-update.zip");
    window.gauravPos = { chooseUpdatePackage };
    const requestManagerApproval = vi.fn().mockResolvedValue({ pin: "1234", reason: "Install app update", approvedBy: "admin" });

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel, { requestManagerApproval });

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Install update" }));

    await waitFor(() => expect(chooseUpdatePackage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(requestManagerApproval).toHaveBeenCalledWith(expect.objectContaining({ title: "Install app update" })));
    await waitFor(() =>
      expect(installUpdateMock).toHaveBeenCalledWith("C:\\updates\\Gaurav POS Hub.gpos-update.zip", "1234")
    );
  });

  it("shows chooser progress and no-selection feedback", async () => {
    updateStatusMock.mockResolvedValue(updateStatus({ baselineRegistered: true }));
    let resolveChoice: (value: string | null) => void = () => undefined;
    const chooseUpdatePackage = vi.fn().mockReturnValue(new Promise<string | null>((resolve) => {
      resolveChoice = resolve;
    }));
    window.gauravPos = { chooseUpdatePackage };
    const setNotice = vi.fn();

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel, { setNotice });

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose package" }));

    expect(await screen.findByText("Opening file picker...")).toBeTruthy();
    resolveChoice(null);
    await waitFor(() => expect(setNotice).toHaveBeenCalledWith({ tone: "bad", text: "No package selected." }));
  });

  it("shows picker errors instead of failing silently", async () => {
    updateStatusMock.mockResolvedValue(updateStatus({ baselineRegistered: true }));
    window.gauravPos = { chooseUpdatePackage: vi.fn().mockRejectedValue(new Error("dialog failed")) };
    const setNotice = vi.fn();

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel, { setNotice });

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose package" }));

    await waitFor(() => expect(setNotice).toHaveBeenCalledWith({ tone: "bad", text: "dialog failed" }));
  });

  it("keeps a visible paste fallback when Electron picker is unavailable", async () => {
    updateStatusMock.mockResolvedValue(updateStatus({ baselineRegistered: true }));

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel);

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    expect(screen.getByText("File picker unavailable. Paste the path manually.")).toBeTruthy();
  });

  it("registers the current installer as a rollback baseline", async () => {
    updateStatusMock.mockResolvedValue(updateStatus({ baselineRegistered: false }));
    registerInstallerBaselineMock.mockResolvedValue({ version: "0.1.0" });

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel);

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Update package or current installer"), {
      target: { value: "C:\\updates\\Gaurav POS Hub Setup 0.1.0.exe" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Register current installer baseline" }));

    await waitFor(() => expect(registerInstallerBaselineMock).toHaveBeenCalled());
    expect(registerInstallerBaselineMock.mock.calls[0]?.[0]).toBe("C:\\updates\\Gaurav POS Hub Setup 0.1.0.exe");
  });

  it("enables only the baseline action that matches the selected file type", async () => {
    updateStatusMock.mockResolvedValue(updateStatus({ baselineRegistered: false }));

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel);

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    const packageBaseline = screen.getByRole("button", { name: "Register package baseline" }) as HTMLButtonElement;
    const installerBaseline = screen.getByRole("button", { name: "Register current installer baseline" }) as HTMLButtonElement;
    const validate = screen.getByRole("button", { name: "Validate" }) as HTMLButtonElement;

    fireEvent.change(screen.getByLabelText("Update package or current installer"), {
      target: { value: "C:\\updates\\Gaurav POS Hub-0.1.0.gpos-update.zip" }
    });
    expect(validate.disabled).toBe(false);
    expect(packageBaseline.disabled).toBe(false);
    expect(installerBaseline.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Update package or current installer"), {
      target: { value: "C:\\updates\\Gaurav POS Hub Setup 0.1.0.exe" }
    });
    expect(validate.disabled).toBe(true);
    expect(packageBaseline.disabled).toBe(true);
    expect(installerBaseline.disabled).toBe(false);
  });

  it("explains why install cannot continue when rollback baseline is missing", async () => {
    updateStatusMock.mockResolvedValue(updateStatus({ baselineRegistered: false }));
    const chooseUpdatePackage = vi.fn().mockResolvedValue("C:\\updates\\Gaurav POS Hub.gpos-update.zip");
    window.gauravPos = { chooseUpdatePackage };
    const requestManagerApproval = vi.fn();
    const setNotice = vi.fn();

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel, { requestManagerApproval, setNotice });

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Install update" }));

    await waitFor(() =>
      expect(setNotice).toHaveBeenCalledWith({
        tone: "bad",
        text: "Register the current version as rollback baseline before installing updates. Use the current .gpos-update.zip or the current installer .exe."
      })
    );
    expect(requestManagerApproval).not.toHaveBeenCalled();
    expect(installUpdateMock).not.toHaveBeenCalled();
  });

  it("does not ask for Manager PIN when Install update is pointed at an installer exe", async () => {
    updateStatusMock.mockResolvedValue(updateStatus({ baselineRegistered: true }));
    const requestManagerApproval = vi.fn();
    const setNotice = vi.fn();

    const { AppUpdatePanel } = await import("../renderer/components/advanced/advanced-view.js");
    renderAppUpdatePanel(AppUpdatePanel, { requestManagerApproval, setNotice });

    expect(await screen.findByText("App 0.1.0 · DB 10")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Update package or current installer"), {
      target: { value: "C:\\updates\\Gaurav POS Hub Setup 0.1.0.exe" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Install update" }));

    await waitFor(() =>
      expect(setNotice).toHaveBeenCalledWith({
        tone: "bad",
        text: "Install update requires a .gpos-update.zip package. Use the installer only for baseline registration."
      })
    );
    expect(requestManagerApproval).not.toHaveBeenCalled();
    expect(installUpdateMock).not.toHaveBeenCalled();
  });
});

function renderAppUpdatePanel(
  AppUpdatePanel: ComponentType<{
    setNotice: NoticeSetter;
    requestManagerApproval: ManagerApprovalRequest;
  }>,
  options: {
    setNotice?: NoticeSetter;
    requestManagerApproval?: ManagerApprovalRequest;
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
      <AppUpdatePanel
        setNotice={options.setNotice ?? vi.fn()}
        requestManagerApproval={options.requestManagerApproval ?? vi.fn()}
      />
    </QueryClientProvider>
  );
}

function updateStatus(overrides: { baselineRegistered: boolean; activeOrderCount?: number }) {
  return {
    appVersion: "0.1.0",
    dbSchemaVersion: 10,
    activeOrderCount: overrides.activeOrderCount ?? 0,
    baselineRegistered: overrides.baselineRegistered,
    rollbackAvailable: false,
    current: overrides.baselineRegistered ? { version: "0.1.0" } : undefined,
    previous: undefined
  };
}
