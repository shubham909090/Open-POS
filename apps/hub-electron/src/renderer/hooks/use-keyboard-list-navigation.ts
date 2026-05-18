import { useCallback, useEffect, useState, type KeyboardEvent } from "react";

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

  useEffect(() => {
    setActiveIndex(0);
  }, [resetKey]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, items.length - 1)));
  }, [items.length]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!enabled || !items.length) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(items.length - 1, current + 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(0, current - 1));
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

  return { activeIndex, onKeyDown, setActiveIndex };
}
