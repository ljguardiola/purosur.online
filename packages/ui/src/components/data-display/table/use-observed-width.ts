import { useState } from "react";
import { flushSync } from "react-dom";

// The width is committed before the next paint, so a table never shows one frame in the layout its
// container has already outgrown.
export function useObservedWidth() {
  const [width, setWidth] = useState<number | undefined>(undefined);

  function observeWidth(element: HTMLElement | null) {
    if (element === null) {
      return;
    }
    setWidth(element.getBoundingClientRect().width);
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        flushSync(() => setWidth(entry.contentRect.width));
      }
    });
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }

  return { width, observeWidth };
}
