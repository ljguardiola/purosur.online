import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
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
  useRestoreFocusOnClose(open);

  // The modal is portaled out of the area, so a marker left in the flow stands for the area.
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
      {narrow ? (
        <ModalPanel onClose={onClose} title={title} footer={footer}>
          {children}
        </ModalPanel>
      ) : (
        <BesidePanel onClose={onClose} title={title} footer={footer}>
          {children}
        </BesidePanel>
      )}
    </>
  );
}

// Both modes unmount the panel when it switches, so the element to go back to is kept here, where
// the panel's open state lives.
function useRestoreFocusOnClose(open: boolean) {
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const opener = document.activeElement;
    return () => {
      queueMicrotask(() => {
        const focusIsLost =
          document.activeElement === null || document.activeElement === document.body;
        if (focusIsLost && opener instanceof HTMLElement && opener.isConnected) {
          opener.focus();
        }
      });
    };
  }, [open]);
}

// A native listener sees only the keys pressed inside the element's own DOM; a React handler would
// also receive those of a modal opened from the panel's content, which React bubbles through the
// portal.
function useCloseOnEscape(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    element.addEventListener("keydown", closeOnEscape);
    return () => element.removeEventListener("keydown", closeOnEscape);
  }, [ref, onClose]);
}

type PanelProps = Omit<DetailPanelProps, "open">;

function BesidePanel(props: PanelProps) {
  const scopeRef = useRef<HTMLDivElement>(null);
  useCloseOnEscape(scopeRef, props.onClose);

  return (
    <div ref={scopeRef} className="contents">
      <Panel {...props} width="panel" />
    </div>
  );
}

function ModalPanel(props: PanelProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useCloseOnEscape(modalRef, props.onClose);

  return (
    <AriaModalOverlay
      isOpen
      isDismissable={false}
      isKeyboardDismissDisabled
      className="fixed inset-0 z-overlay flex items-center justify-center bg-backdrop"
    >
      <AriaModal
        ref={modalRef}
        className="flex max-h-modal w-180 max-w-modal shrink-0 flex-col overflow-hidden rounded-xl bg-surface shadow-xl"
      >
        <AriaDialog className="flex min-h-0 flex-1 flex-col outline-none">
          <Panel {...props} width="fill" />
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}

function Panel({
  onClose,
  title,
  children,
  footer,
  width,
}: PanelProps & { width: "panel" | "fill" }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <SidePanel
      label={title}
      footer={footer}
      width={width}
      header={
        <div className="flex items-center justify-between gap-4 border-b border-border px-8 py-4">
          <AriaHeading
            ref={headingRef}
            level={2}
            slot="title"
            tabIndex={-1}
            className="text-heading text-text outline-none"
          >
            {title}
          </AriaHeading>
          <CloseButton onPress={onClose} />
        </div>
      }
    >
      {children}
    </SidePanel>
  );
}
