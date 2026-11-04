import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

export function useKeyboardListNavigation<T>({
  items,
  enabled = true,
  resetKey,
  onCommit
}: {
  items: T[];
  enabled?: boolean;
  resetKey?: unknown;
  onCommit: (item: T, index: number) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const rows = useRef(new Map<number, HTMLElement>());
  const keyboardMove = useRef(false);
  const setItemElement = useCallback((index: number, element: HTMLElement | null) => {
    if (element) rows.current.set(index, element);
    else rows.current.delete(index);
  }, []);
  const selectIndex = useCallback((index: number) => {
    keyboardMove.current = false;
    setActiveIndex(index);
  }, []);

  useEffect(() => {
    keyboardMove.current = false;
    setActiveIndex(0);
  }, [resetKey]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    if (!keyboardMove.current) return;
    keyboardMove.current = false;
    rows.current.get(activeIndex)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }, [activeIndex]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!enabled || !items.length) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = Math.min(items.length - 1, activeIndex + 1);
        if (next !== activeIndex) {
          keyboardMove.current = true;
          setActiveIndex(next);
        }
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const next = Math.max(0, activeIndex - 1);
        if (next !== activeIndex) {
          keyboardMove.current = true;
          setActiveIndex(next);
        }
        return;
      }

      if (event.key === "Enter") {
        const selected = items[activeIndex] ?? items[0];
        if (!selected) return;
        event.preventDefault();
        onCommit(selected, activeIndex);
      }
    },
    [activeIndex, enabled, items, onCommit]
  );

  return { activeIndex, onKeyDown, setActiveIndex: selectIndex, setItemElement };
}
