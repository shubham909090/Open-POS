// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const updateCloudBackupMock = vi.fn();

describe("HubConnectionCard cloud backup switch", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
    updateCloudBackupMock.mockReset();
  });

  it("shows Cloud Backup off by default and blocks toggling until Master PIN exists", async () => {
    const { HubConnectionCard } = await importHubConnectionCard();

    renderHubConnectionCard(HubConnectionCard, {
      setup: {
        hubConnection: hubConnection(),
        license: { status: "active", message: "License is active." },
        masterPinConfigured: false,
        cloudBackupEnabled: false
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /Hub Connection And Security/ }));

    expect(screen.getByText("Cloud Backup Off · License checks and app updates stay active")).toBeTruthy();
    expect(screen.getByText("Create Master PIN first to change Cloud Backup.")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: /Turn On Cloud Backup/ }).disabled).toBe(true);
  });

  it("uses owner Master PIN approval when turning Cloud Backup on", async () => {
    const { HubConnectionCard } = await importHubConnectionCard();
    const requestManagerApproval = vi.fn().mockResolvedValue({ pin: "9876", reason: "Enable cloud backup", approvedBy: "owner" });
    const onSaved = vi.fn();
    updateCloudBackupMock.mockResolvedValue({ enabled: true });

    renderHubConnectionCard(
      HubConnectionCard,
      {
        setup: {
          hubConnection: hubConnection(),
          license: { status: "active", message: "License is active." },
          masterPinConfigured: true,
          cloudBackupEnabled: false
        }
      },
      { requestManagerApproval, onSaved }
    );
    fireEvent.click(screen.getByRole("button", { name: /Hub Connection And Security/ }));

    fireEvent.click(screen.getByRole("button", { name: /Turn On Cloud Backup/ }));

    await waitFor(() =>
      expect(requestManagerApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          pinLabel: "Master PIN",
          approvedBy: "owner",
          defaultReason: "Enable cloud backup"
        })
      )
    );
    await waitFor(() =>
      expect(updateCloudBackupMock).toHaveBeenCalledWith({
        enabled: true,
        masterApproval: { pin: "9876", reason: "Enable cloud backup", approvedBy: "owner" }
      })
    );
    expect(onSaved).toHaveBeenCalled();
  });
});

async function importHubConnectionCard() {
  vi.doMock("../renderer/hub-api.js", () => ({
    hubApi: {
      updateCloudBackup: updateCloudBackupMock,
      hubConnection: vi.fn(),
      updateHubConnection: vi.fn(),
      testHubConnection: vi.fn(),
      activateLicense: vi.fn(),
      checkLicense: vi.fn()
    }
  }));
  return import("../renderer/components/setup/hub-connection-card.js");
}

function renderHubConnectionCard(
  HubConnectionCard: typeof import("../renderer/components/setup/hub-connection-card.js").HubConnectionCard,
  bootstrap: Record<string, unknown>,
  options: { requestManagerApproval?: ReturnType<typeof vi.fn>; onSaved?: ReturnType<typeof vi.fn> } = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HubConnectionCard
        bootstrap={bootstrap as never}
        setNotice={vi.fn()}
        requestManagerApproval={options.requestManagerApproval ?? vi.fn()}
        onSaved={options.onSaved ?? vi.fn()}
      />
    </QueryClientProvider>
  );
}

function hubConnection() {
  return {
    configured: true,
    cloudUrl: "https://example.convex.site",
    installationId: "install-main",
    syncSecret: "••••••••••••",
    hubPublicUrl: "http://192.168.1.20:3737"
  };
}
