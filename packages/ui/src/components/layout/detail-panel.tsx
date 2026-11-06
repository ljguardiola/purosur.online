import {
  type HTMLAttributes,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FocusScope, useModalOverlay, useOverlay } from "react-aria";
import { useOverlayTriggerState } from "react-stately";
import { CloseButton } from "../shared/close-button";
import { SidePanel } from "./side-panel";

export type DetailPanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode | undefined;
};

const NARROW_AREA_WIDTH = 800;

export function DetailPanel({ open, onClose, title, children, footer }: DetailPanelProps) {
  const [narrow, setNarrow] = useState(false);
  const markPressInsidePanel = useRestoreFocusOnClose(open);

  // The panel leaves the area's flow as a modal, so a marker left in the flow stands for the area.
  function observeArea(marker: HTMLSpanElement | null) {
    const area = marker?.parentElement;
    if (area === null || area === undefined) {
      return;
    }
    const measure = () => setNarrow(area.clientWidth < NARROW_AREA_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }

  if (!open) {
    return null;
  }
  return (
    <>
      <span ref={observeArea} hidden />
      <PanelFrame
        onPressInside={markPressInsidePanel}
        narrow={narrow}
        onClose={onClose}
        title={title}
        footer={footer}
      >
        {children}
      </PanelFrame>
    </>
  );
}

const CONTROL = "button, a[href], input, select, textarea, summary, [tabindex]";
const KEY_PRESSED_CONTROL = "button, [role='button'], a[href], [role='link'], summary";

// Pressing a design-system button with Enter or Space fires no click, so the key itself is the press.
function pressedControl(event: Event): Element | null {
  if (!event.isTrusted || !(event.target instanceof Element)) {
    return null;
  }
  if (event instanceof KeyboardEvent) {
    return event.key === "Enter" || event.key === " "
      ? event.target.closest(KEY_PRESSED_CONTROL)
      : null;
  }
  return event.target.closest(CONTROL);
}

function useRestoreFocusOnClose(open: boolean) {
  const returnTargetRef = useRef<Element | null>(null);
  const pressesInsidePanelRef = useRef(new WeakSet<Event>());

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const focused = document.activeElement;
    if (focused !== null && focused !== document.body) {
      returnTargetRef.current = focused;
    }
    // The panel's React handlers, which also hear presses on the overlays its content portals,
    // run after these document listeners, so a press is settled as outside only at the next
    // press or on close.
    let lastPress: { event: Event; control: Element } | null = null;
    const settleLastPress = () => {
      if (lastPress !== null && !pressesInsidePanelRef.current.has(lastPress.event)) {
        returnTargetRef.current = lastPress.control;
      }
      lastPress = null;
    };
    const recordPress = (event: Event) => {
      const control = pressedControl(event);
      if (control === null) {
        return;
      }
      settleLastPress();
      lastPress = { event, control };
    };
    document.addEventListener("click", recordPress, true);
    document.addEventListener("keydown", recordPress, true);
    return () => {
      document.removeEventListener("click", recordPress, true);
      document.removeEventListener("keydown", recordPress, true);
      settleLastPress();
      queueMicrotask(() => {
        const returnTarget = returnTargetRef.current;
        const focusIsLost =
          document.activeElement === null || document.activeElement === document.body;
        if (focusIsLost && returnTarget instanceof HTMLElement && returnTarget.isConnected) {
          returnTarget.focus();
        }
      });
    };
  }, [open]);

  return (event: SyntheticEvent) => {
    pressesInsidePanelRef.current.add(event.nativeEvent);
  };
}

type PanelProps = Omit<DetailPanelProps, "open">;

// Both modes render the same elements, only styled and announced differently, so the caller's
// content stays mounted when the area is resized across the narrow width.
function PanelFrame({
  onPressInside,
  narrow,
  onClose,
  title,
  children,
  footer,
}: PanelProps & { onPressInside: (event: SyntheticEvent) => void; narrow: boolean }) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The panel is one overlay in both modes, so Escape closes it only while no overlay opened from
  // its content, such as a combo box's list or a confirmation, is above it.
  const { overlayProps } = useOverlay({ isOpen: true, onClose, isDismissable: false }, dialogRef);
  const modalState = useOverlayTriggerState({ isOpen: narrow });
  useModalOverlay({ isDismissable: false, isKeyboardDismissDisabled: true }, modalState, dialogRef);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (narrow && !dialogRef.current?.contains(document.activeElement)) {
      headingRef.current?.focus();
    }
  }, [narrow]);

  const modalDialogProps: HTMLAttributes<HTMLDivElement> = {
    role: "dialog",
    "aria-labelledby": headingId,
    tabIndex: -1,
  };

  return (
    <div
      onClickCapture={onPressInside}
      onKeyDownCapture={onPressInside}
      className={
        narrow ? "fixed inset-0 z-overlay flex items-center justify-center bg-backdrop" : "contents"
      }
    >
      <FocusScope contain={narrow}>
        <div
          className={
            narrow
              ? "flex max-h-modal w-180 max-w-modal shrink-0 flex-col overflow-hidden rounded-xl bg-surface shadow-xl"
              : "contents"
          }
        >
          <div
            ref={dialogRef}
            {...overlayProps}
            {...(narrow ? modalDialogProps : {})}
            className={narrow ? "flex min-h-0 flex-1 flex-col outline-none" : "contents"}
          >
            <SidePanel
              label={title}
              footer={footer}
              width={narrow ? "fill" : "panel"}
              header={
                <div className="flex items-center justify-between gap-4 border-b border-border px-8 py-4">
                  <h2
                    ref={headingRef}
                    id={headingId}
                    tabIndex={-1}
                    className="text-heading text-text outline-none"
                  >
                    {title}
                  </h2>
                  <CloseButton onPress={onClose} />
                </div>
              }
            >
              {children}
            </SidePanel>
          </div>
        </div>
      </FocusScope>
    </div>
  );
}
