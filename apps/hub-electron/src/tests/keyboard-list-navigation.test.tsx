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
    return <><input aria-label="Search" onKeyDown={keyboard.onKeyDown} /><div style={{ height: 80, overflow: "auto" }}>{Array.from({ length: 12 }, (_, i) => <div key={i} ref={(node) => keyboard.setItemElement(i, node)} onPointerMove={(event) => keyboard.onPointerMove(i, event)} data-testid={`dish-${i}`} data-active={keyboard.activeIndex === i}>Dish {i}</div>)}</div></>;
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

it("keeps the first result after typing beneath a stationary pointer, but follows intentional pointer movement", () => {
  const commit = vi.fn();
  function Search({ query }: { query: string }) {
    const keyboard = useKeyboardListNavigation({ items: [query + " first", query + " second"], resetKey: query, onCommit: commit });
    return <><input aria-label="Dish search" onKeyDown={keyboard.onKeyDown} /><div data-testid="second-result" onPointerMove={(event) => keyboard.onPointerMove(1, event)}>Second</div></>;
  }
  const { rerender } = render(<Search query="old" />);
  const row = screen.getByTestId("second-result");
  const move = (movementX: number) => {
    const event = new MouseEvent("pointermove", { bubbles: true });
    Object.defineProperties(event, { movementX: { value: movementX }, movementY: { value: 0 } });
    fireEvent(row, event);
  };
  move(3);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(commit).toHaveBeenLastCalledWith("old second", 1);
  rerender(<Search query="new" />);
  fireEvent.pointerEnter(row);
  move(0);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(commit).toHaveBeenLastCalledWith("new first", 0);
  move(2);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(commit).toHaveBeenLastCalledWith("new second", 1);
});
