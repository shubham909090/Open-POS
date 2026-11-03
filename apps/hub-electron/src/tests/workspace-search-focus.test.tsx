// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HubNavigation } from "../renderer/components/hub-navigation.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("returns keyboard focus to the current page after closing Ctrl+K navigation", async () => {
  render(
    <HubNavigation
      view="orders"
      onChange={vi.fn()}
      unlocked
      managerPinConfigured
      onUnlock={vi.fn()}
      onLock={vi.fn()}
    />,
  );
  const orders = screen.getByRole("button", { name: "Orders" });
  orders.focus();
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const search = await screen.findByRole("combobox", { name: "Search pages" });
  await waitFor(() => expect(document.activeElement).toBe(search));
  fireEvent.keyDown(search, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(orders));
});
