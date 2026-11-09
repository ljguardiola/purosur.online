import { type FocusEvent, useLayoutEffect, useRef, useState } from "react";

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

function overflowsItsBox(region: HTMLElement) {
  return region.scrollHeight > region.clientHeight || region.scrollWidth > region.clientWidth;
}

// A body that scrolls with nothing focusable in it could not be scrolled from the keyboard, so it
// takes a tab stop of its own only while it overflows, kept while it holds the focus so the focus
// never drops out of its container when its content shrinks. Its size stops changing once it reaches
// its container's cap, so the content's boxes are observed too, and mutations catch text that changes
// inside a box that keeps its size. The observers only report at the next frame, so a render that
// changes its size is measured as it commits, leaving no frame in which it scrolls without a tab stop.
export function useKeyboardScrollableRegion(labelledBy: string) {
  const [overflows, setOverflows] = useState(false);
  const [holdsFocus, setHoldsFocus] = useState(false);
  const regionRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (regionRef.current !== null) {
      setOverflows(overflowsItsBox(regionRef.current));
    }
  });

  function observeOverflow(region: HTMLElement | null) {
    if (region === null) {
      return;
    }
    regionRef.current = region;
    setHoldsFocus(region === document.activeElement);
    const updateOverflow = () => setOverflows(overflowsItsBox(region));
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
      regionRef.current = null;
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
