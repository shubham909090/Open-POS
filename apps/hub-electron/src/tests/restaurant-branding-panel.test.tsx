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

vi.mock("react-easy-crop", () => ({
  default: ({ onCropAreaChange, initialCroppedAreaPercentages }: {
    onCropAreaChange: (area: { x: number; y: number; width: number; height: number }) => void;
    initialCroppedAreaPercentages?: { x: number; y: number; width: number; height: number };
  }) => (
    <div data-testid="cropper" data-initial-area={JSON.stringify(initialCroppedAreaPercentages)}>
      <button type="button" onClick={() => onCropAreaChange({ x: 25, y: 0, width: 50, height: 100 })}>Frame icon</button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const branding = { restaurantName: "Saffron Table", logoImageDataUrl: "data:image/png;base64,AAAA", updatedAt: "2026-11-04T08:00:00.000Z" };
const approval = { pin: "9876", reason: "Update restaurant name", approvedBy: "master" };

function renderPanel(masterPinConfigured = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  vi.mocked(hubApi.updateRestaurantBranding).mockResolvedValue({ branding });
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
  await screen.findByText("S", { selector: ".branding-name-mark" });
  expect(screen.queryByAltText("Default app mark")).toBeNull();
  cleanup();
  renderPanel(false);
  expect(screen.getByRole("button", { name: "Replace logo" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("textbox", { name: /Restaurant name/ }).hasAttribute("disabled")).toBe(true);
});

it("keeps cancelled icon framing local and saves accepted framing through Master PIN", async () => {
  const { requestManagerApproval } = renderPanel();
  fireEvent.click(screen.getByRole("button", { name: "Adjust icon" }));
  fireEvent.click(screen.getByRole("button", { name: "Frame icon" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Save identity" }).hasAttribute("disabled")).toBe(true);
  expect(hubApi.updateRestaurantBranding).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Adjust icon" }));
  fireEvent.click(screen.getByRole("button", { name: "Frame icon" }));
  fireEvent.click(screen.getByRole("button", { name: "Use icon" }));
  expect(requestManagerApproval).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save identity" }));
  await waitFor(() => expect(hubApi.updateRestaurantBranding).toHaveBeenCalledWith({
    restaurantName: branding.restaurantName,
    iconCrop: { x: 0.25, y: 0, width: 0.5, height: 1 },
    expectedUpdatedAt: branding.updatedAt,
    masterApproval: approval,
  }));
});

it("reopens saved icon framing and resets it without replacing the receipt image", async () => {
  const { client } = renderPanel();
  const iconCrop = { x: 0.25, y: 0, width: 0.5, height: 1 };
  await act(async () => {
    client.setQueryData(["restaurant-branding"], { branding: { ...branding, iconCrop, updatedAt: "2026-11-04T09:00:00.000Z" } });
  });
  await waitFor(() => expect(document.querySelector(".branding-icon-preview.cropped")).not.toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Adjust icon" }));
  expect(screen.getByTestId("cropper").getAttribute("data-initial-area")).toBe(JSON.stringify({ x: 25, y: 0, width: 50, height: 100 }));
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  fireEvent.click(screen.getByRole("button", { name: "Save identity" }));
  await waitFor(() => expect(hubApi.updateRestaurantBranding).toHaveBeenCalledWith(expect.objectContaining({ iconCrop: null })));
  expect(vi.mocked(hubApi.updateRestaurantBranding).mock.calls[0]![0].imageDataUrl).toBeUndefined();
});


it("saves a logo-only identity without requiring a restaurant name", async () => {
  renderPanel();
  vi.mocked(hubApi.updateRestaurantBranding).mockResolvedValueOnce({ branding: { ...branding, restaurantName: "" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Restaurant name/ }), { target: { value: "" } });
  expect(screen.getByRole("button", { name: "Save identity" }).hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Save identity" }));
  await waitFor(() => expect(hubApi.updateRestaurantBranding).toHaveBeenCalledWith(expect.objectContaining({ restaurantName: "", masterApproval: approval })));
  expect(screen.queryByRole("alert")).toBeNull();
});
