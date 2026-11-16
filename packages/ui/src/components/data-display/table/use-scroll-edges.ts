import { useState } from "react";

// Which sides of a sideways-scrolling region still hold content out of sight, kept current as the
// region is scrolled, resized or its content changes.
export function useScrollEdges() {
  const [clippedAtStart, setClippedAtStart] = useState(false);
  const [clippedAtEnd, setClippedAtEnd] = useState(false);

  function observeScrollEdges(region: HTMLElement | null) {
    if (region === null) {
      return;
    }
    const update = () => {
      setClippedAtStart(region.scrollLeft > 1);
      setClippedAtEnd(region.scrollLeft + region.clientWidth < region.scrollWidth - 1);
    };
    update();
    region.addEventListener("scroll", update);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(region);
    for (const child of region.children) {
      resizeObserver.observe(child);
    }
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(region, { childList: true, subtree: true, characterData: true });
    return () => {
      region.removeEventListener("scroll", update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }

  return { clippedAtStart, clippedAtEnd, observeScrollEdges };
}
