import { type FocusEvent, useState } from "react";

// A wrapper drawn with `display: contents` has no box of its own to resize, so what it holds is
// observed instead.
function observeContentBoxes(element: Element, observer: ResizeObserver) {
  for (const child of element.children) {
    if (getComputedStyle(child).display === "contents") {
      observeContentBoxes(child, observer);
    } else {
      observer.observe(child);
    }
  }
}

// A body that scrolls with nothing focusable in it could not be scrolled from the keyboard, so it
// takes a tab stop of its own only while it overflows, kept while it holds the focus so the focus
// never drops out of its container when its content shrinks. Its size stops changing once it reaches
// its container's cap, so the content's boxes are observed too, and mutations catch text that changes
// inside a box that keeps its size.
export function useKeyboardScrollableRegion(labelledBy: string) {
  const [overflows, setOverflows] = useState(false);
  const [holdsFocus, setHoldsFocus] = useState(false);

  function observeOverflow(region: HTMLElement | null) {
    if (region === null) {
      return;
    }
    setHoldsFocus(region === document.activeElement);
    const updateOverflow = () =>
      setOverflows(
        region.scrollHeight > region.clientHeight || region.scrollWidth > region.clientWidth,
      );
    const resizeObserver = new ResizeObserver(updateOverflow);
    const observeBoxes = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(region);
      observeContentBoxes(region, resizeObserver);
    };
    const mutationObserver = new MutationObserver(() => {
      observeBoxes();
      updateOverflow();
    });
    updateOverflow();
    observeBoxes();
    mutationObserver.observe(region, { childList: true, subtree: true, characterData: true });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }

  return {
    observeOverflow,
    regionProps: {
      ...(overflows || holdsFocus
        ? { role: "region", tabIndex: 0, "aria-labelledby": labelledBy }
        : {}),
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (event.target === event.currentTarget) {
          setHoldsFocus(true);
        }
      },
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (event.target === event.currentTarget) {
          setHoldsFocus(false);
        }
      },
    },
    // Inset, so the ring stays inside the region instead of drawing over what borders it.
    focusClassName: "outline-none focus-visible:focus-ring-inset",
  };
}
