// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EditableRecordList } from "../renderer/components/setup/editable-record-list.js";

afterEach(cleanup);
it("keeps a large catalog reachable through load more and searches the entire catalog", () => {
  const rows = Array.from({ length: 65 }, (_, i) => ({ id: String(i), title: `Dish ${i + 1}`, meta: "Food", active: true, onToggle: vi.fn(), onDelete: vi.fn(), editForm: () => null }));
  render(<EditableRecordList rows={rows} setNotice={vi.fn()} />);
  expect(screen.queryByText("Dish 65")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show 5 more" }));
  expect(screen.getByText("Dish 65")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Search saved records" }), { target: { value: "Dish 65" } });
  expect(screen.getByText("Dish 65")).toBeTruthy();
  expect(screen.queryByText("Dish 1")).toBeNull();
});

it("tile layout keeps per-table actions behind one tile button", async () => {
  const onToggle = vi.fn().mockResolvedValue(undefined);
  const rows = ["T1", "T2"].map((title) => ({ id: title, title, meta: "Free", active: true, onToggle, onDelete: vi.fn(), editForm: () => <form aria-label={`${title} form`} /> }));
  render(<EditableRecordList rows={rows} layout="tiles" setNotice={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Disable" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit T2" }));
  expect(screen.getByRole("group", { name: "Edit T2" })).toBeTruthy();
  expect(screen.getByRole("form", { name: "T2 form" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Disable" }));
  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Delete T2" })).toBeTruthy();
  await waitFor(() => expect((screen.getByRole("button", { name: "Close T2", expanded: true }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Close T2", expanded: true }));
  expect(screen.queryByRole("group", { name: "Edit T2" })).toBeNull();
});
