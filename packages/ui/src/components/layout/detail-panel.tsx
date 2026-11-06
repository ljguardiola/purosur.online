import {
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
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
  const frameRef = useRef<HTMLDivElement>(null);
  useRestoreFocusOnClose(open ? title : null, frameRef);

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
        frameRef={frameRef}
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

function useRestoreFocusOnClose(
  openRecord: string | null,
  frameRef: RefObject<HTMLElement | null>,
) {
  const openerRef = useRef<Element | null>(null);
  const open = openRecord !== null;

  useLayoutEffect(() => {
    if (openRecord === null) {
      return;
    }
    const focused = document.activeElement;
    if (focused !== null && focused !== document.body && !frameRef.current?.contains(focused)) {
      openerRef.current = focused;
    }
  }, [openRecord, frameRef]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    return () => {
      queueMicrotask(() => {
        const opener = openerRef.current;
        const focusIsLost =
          document.activeElement === null || document.activeElement === document.body;
        if (focusIsLost && opener instanceof HTMLElement && opener.isConnected) {
          opener.focus();
        }
      });
    };
  }, [open]);
}

type PanelProps = Omit<DetailPanelProps, "open">;

// Both modes render the same elements, only styled and announced differently, so the caller's
// content stays mounted when the area is resized across the narrow width.
function PanelFrame({
  frameRef,
  narrow,
  onClose,
  title,
  children,
  footer,
}: PanelProps & { frameRef: RefObject<HTMLDivElement | null>; narrow: boolean }) {
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
      ref={frameRef}
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
