// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RestaurantBrandingPanel } from "../renderer/components/setup/restaurant-branding-panel.js";
import { SettingsPageContext } from "../renderer/components/setup/setup-card.js";
import { hubApi } from "../renderer/hub-api.js";

vi.mock("../renderer/hub-api.js", () => ({
  hubApi: { restaurantBranding: vi.fn(), updateRestaurantBranding: vi.fn(), removeRestaurantLogo: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const branding = { restaurantName: "Saffron Table", logoImageDataUrl: "data:image/png;base64,AAAA", updatedAt: "2026-11-04T08:00:00.000Z" };
const approval = { pin: "9876", reason: "Update restaurant name", approvedBy: "master" };

function renderPanel(masterPinConfigured = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["restaurant-branding"], { branding });
  const requestManagerApproval = vi.fn().mockResolvedValue(approval);
  render(
    <QueryClientProvider client={client}>
      <SettingsPageContext.Provider value>
        <RestaurantBrandingPanel masterPinConfigured={masterPinConfigured} requestManagerApproval={requestManagerApproval} setNotice={vi.fn()} />
      </SettingsPageContext.Provider>
    </QueryClientProvider>,
  );
  return { requestManagerApproval, client };
}

it("saves a renamed restaurant with Master PIN approval and keeps the stored logo", async () => {
  const { requestManagerApproval } = renderPanel();
  vi.mocked(hubApi.updateRestaurantBranding).mockResolvedValueOnce({ branding: { ...branding, restaurantName: "Saffron Table Kitchen" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Restaurant name/ }), { target: { value: "  Saffron Table Kitchen " } });
  fireEvent.click(screen.getByRole("button", { name: "Save identity" }));
  await waitFor(() => expect(hubApi.updateRestaurantBranding).toHaveBeenCalledTimes(1));
  expect(requestManagerApproval).toHaveBeenCalledWith(expect.objectContaining({ approvedBy: "master", pinLabel: "Master PIN" }));
  // No imageDataUrl: the server keeps the current logo.
  expect(vi.mocked(hubApi.updateRestaurantBranding).mock.calls[0]![0]).toEqual({
    restaurantName: "Saffron Table Kitchen",
    expectedUpdatedAt: branding.updatedAt,
    masterApproval: approval,
  });
});

it("retains an unsaved identity when another device changes it and offers an explicit reload", async () => {
  const { client, requestManagerApproval } = renderPanel();
  const name = screen.getByRole("textbox", { name: /Restaurant name/ }) as HTMLInputElement;
  fireEvent.change(name, { target: { value: "My unsaved name" } });
  await act(async () => {
    client.setQueryData(["restaurant-branding"], { branding: { ...branding, restaurantName: "Updated on captain", updatedAt: "2026-11-04T09:00:00.000Z" } });
  });
  await screen.findByText(/identity changed on another device/);
  expect(name.value).toBe("My unsaved name");
  expect(screen.getByRole("button", { name: "Save identity" }).hasAttribute("disabled")).toBe(true);
  expect(requestManagerApproval).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load current identity" }));
  expect(name.value).toBe("Updated on captain");
  expect(screen.queryByText(/identity changed on another device/)).toBeNull();
});

it("removes the logo only after approval and never offers changes without a Master PIN", async () => {
  renderPanel();
  vi.mocked(hubApi.removeRestaurantLogo).mockResolvedValueOnce({ branding: { ...branding, logoImageDataUrl: null } });
  fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
  await waitFor(() => expect(hubApi.removeRestaurantLogo).toHaveBeenCalledWith({ expectedUpdatedAt: branding.updatedAt, masterApproval: approval }));
  cleanup();
  renderPanel(false);
  expect(screen.getByRole("button", { name: "Replace logo" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("textbox", { name: /Restaurant name/ }).hasAttribute("disabled")).toBe(true);
});
