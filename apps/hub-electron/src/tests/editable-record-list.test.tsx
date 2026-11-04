// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
