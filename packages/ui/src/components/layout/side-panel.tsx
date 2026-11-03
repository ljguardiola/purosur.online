import { type ReactNode, useId, useState } from "react";

export type SidePanelProps = {
  children: ReactNode;
  label: string;
  footer?: ReactNode | undefined;
};

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

// Inset, so the ring stays inside the body instead of drawing over the footer.
const scrollingBodyFocusClassName = "outline-none focus-visible:focus-ring-inset";

export function SidePanel({ children, label, footer }: SidePanelProps) {
  const panelId = useId();
  const [bodyOverflows, setBodyOverflows] = useState(false);

  // A body that scrolls with nothing focusable in it could not be scrolled from the keyboard, so it
  // takes a tab stop of its own only while it overflows. Its size stops changing once it reaches the
  // panel's height, so the content's boxes are observed too, and mutations catch text that changes
  // inside a box that keeps its size.
  function observeBodyOverflow(body: HTMLDivElement | null) {
    if (body === null) {
      return;
    }
    const updateOverflow = () => setBodyOverflows(body.scrollHeight > body.clientHeight);
    const resizeObserver = new ResizeObserver(updateOverflow);
    const observeBoxes = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(body);
      observeContentBoxes(body, resizeObserver);
    };
    const mutationObserver = new MutationObserver(() => {
      observeBoxes();
      updateOverflow();
    });
    updateOverflow();
    observeBoxes();
    mutationObserver.observe(body, { childList: true, subtree: true, characterData: true });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }

  const scrollingBodyProps = bodyOverflows
    ? { role: "region", tabIndex: 0, "aria-labelledby": panelId }
    : {};

  return (
    <aside
      id={panelId}
      aria-label={label}
      className="flex h-full w-98 shrink-0 flex-col border-l border-border bg-surface"
    >
      <div
        ref={observeBodyOverflow}
        {...scrollingBodyProps}
        className={`relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-8 pt-8 ${footer === undefined ? "pb-8" : "pb-4"} ${scrollingBodyFocusClassName}`}
      >
        {children}
      </div>
      {footer === undefined ? null : (
        <div className="flex shrink-0 flex-col gap-4 px-8 pb-8">{footer}</div>
      )}
    </aside>
  );
}
