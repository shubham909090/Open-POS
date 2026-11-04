// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { HubNavigation } from "../renderer/components/hub-navigation.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("returns keyboard focus to the current page after closing Ctrl+K navigation", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["restaurant-branding"], { branding: { restaurantName: "Saffron Table", logoImageDataUrl: null, updatedAt: null } });
  render(
    <QueryClientProvider client={client}>
    <HubNavigation
      view="orders"
      onChange={vi.fn()}
      unlocked
      managerPinConfigured
      onUnlock={vi.fn()}
      onLock={vi.fn()}
    />
    </QueryClientProvider>,
  );
  // The shell shows the restaurant name, with the bundled mark when no logo is uploaded.
  expect(screen.getByText("Saffron Table")).toBeTruthy();
  expect(document.querySelector<HTMLImageElement>(".workspace-mark img")?.getAttribute("src")).toBe("/brand-mark.png");
  const orders = screen.getByRole("button", { name: "Orders" });
  orders.focus();
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const search = await screen.findByRole("combobox", { name: "Search pages" });
  await waitFor(() => expect(document.activeElement).toBe(search));
  fireEvent.keyDown(search, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(orders));
});
