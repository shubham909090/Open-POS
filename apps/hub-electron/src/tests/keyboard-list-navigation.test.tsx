// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useKeyboardListNavigation } from "../renderer/hooks/use-keyboard-list-navigation.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("reveals the keyboard-selected row before Enter commits, without scrolling on mount, hover or reset", () => {
  const reveal = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: reveal });
  const commit = vi.fn();
  function List({ search = "" }: { search?: string }) {
    const keyboard = useKeyboardListNavigation({ items: Array.from({ length: 12 }, (_, i) => `Dish ${i}`), resetKey: search, onCommit: commit });
    return <><input aria-label="Search" onKeyDown={keyboard.onKeyDown} /><div style={{ height: 80, overflow: "auto" }}>{Array.from({ length: 12 }, (_, i) => <div key={i} ref={(node) => keyboard.setItemElement(i, node)} onMouseEnter={() => keyboard.setActiveIndex(i)} data-testid={`dish-${i}`} data-active={keyboard.activeIndex === i}>Dish {i}</div>)}</div></>;
  }
  const { rerender } = render(<List />);
  expect(reveal).not.toHaveBeenCalled();
  const input = screen.getByRole("textbox", { name: "Search" });
  for (let i = 0; i < 9; i++) fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(reveal.mock.instances.at(-1)).toBe(screen.getByTestId("dish-9"));
  expect(reveal).toHaveBeenLastCalledWith({ block: "nearest", inline: "nearest", behavior: "instant" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(commit).toHaveBeenLastCalledWith("Dish 9", 9);
  const calls = reveal.mock.calls.length;
  fireEvent.mouseEnter(screen.getByTestId("dish-4"));
  expect(reveal).toHaveBeenCalledTimes(calls);
  rerender(<List search="new search" />);
  expect(screen.getByTestId("dish-0").getAttribute("data-active")).toBe("true");
  expect(reveal).toHaveBeenCalledTimes(calls);
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});
