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
  installUpdateMock: vi.fn(),
  rollbackUpdateMock: vi.fn()
}));
const { updateStatusMock, validateUpdatePackageMock, registerUpdateBaselineMock, installUpdateMock, rollbackUpdateMock } = mocks;

vi.mock("../renderer/hub-api.js", () => ({
  hubApi: {
    updateStatus: updateStatusMock,
    validateUpdatePackage: validateUpdatePackageMock,
    registerUpdateBaseline: registerUpdateBaselineMock,
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
        text: "Register the current version as rollback baseline before installing updates."
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
