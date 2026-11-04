// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { UpdateProgressOverlay } from "../renderer/components/advanced/update-progress-overlay.js";

afterEach(cleanup);

it("keeps service controls outside the modal focus scope until the update finishes", async () => {
  const { rerender } = render(<><button data-update-trigger>New order</button><UpdateProgressOverlay open /></>);
  const progress = await screen.findByRole("dialog", { name: "Updating Hub…" });
  const serviceButton = screen.getByText("New order");
  expect(serviceButton.closest('[aria-hidden="true"]')).toBeTruthy();
  serviceButton.focus();
  await waitFor(() => expect(progress.contains(document.activeElement)).toBe(true));
  fireEvent.keyDown(progress, { key: "Escape" });
  expect(screen.getByRole("dialog", { name: "Updating Hub…" })).toBeTruthy();
  rerender(<><button data-update-trigger>New order</button><UpdateProgressOverlay open={false} /></>);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(serviceButton.closest('[aria-hidden="true"]')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(serviceButton));
});
