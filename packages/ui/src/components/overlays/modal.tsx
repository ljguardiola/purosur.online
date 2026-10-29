import {
  Children,
  Fragment,
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  useRef,
} from "react";
import {
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
import { Eyebrow } from "../layout/eyebrow";
import { CloseButton } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { type NoticeTone, type Tone, toneClassName } from "../shared/tone";

export type ModalWidth = "confirmation" | "standard" | "wide" | "editor";

export type ModalBodyPadding = "default" | "none";

export type ModalHeaderLayout = "leading" | "centered";

type ModalCommonProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: ModalWidth;
  tone: NoticeTone;
  icon: Icon;
  title: string;
  children?: ReactNode;
  footer: ReactNode;
};

type ModalLeadingProps = {
  headerLayout?: "leading";
  context?: string;
  contextTone?: Tone;
  bodyPadding?: ModalBodyPadding;
};

type ModalCenteredProps = {
  headerLayout: "centered";
  context?: undefined;
  contextTone?: undefined;
  bodyPadding?: undefined;
};

// In the centered layout, `closable` only enables Escape to dismiss — it draws no close button.
export type ModalProps = ModalCommonProps &
  ((ModalLeadingProps & { closable?: boolean }) | (ModalCenteredProps & { closable?: boolean }));

const widthClassName: Record<ModalWidth, string> = {
  confirmation: "w-140",
  standard: "w-160",
  wide: "w-180",
  editor: "w-260",
};

// Children.toArray drops null/undefined/boolean children but keeps a fragment as one child even
// when everything inside it was dropped, so fragments are looked into.
function hasContent(node: ReactNode): boolean {
  return Children.toArray(node).some((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? hasContent(child.props.children)
      : true,
  );
}

function isCtrlEnter(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
  );
}

export function Modal(props: ModalProps) {
  const {
    open,
    onOpenChange,
    width = "standard",
    tone,
    icon,
    context,
    contextTone = "neutral",
    title,
    children,
    bodyPadding = "default",
    footer,
  } = props;
  const footerRef = useRef<HTMLDivElement>(null);

  // Capturing, because react-aria's fields stop the keys they handle from bubbling; listening on the
  // body leaves the header's and footer's own buttons out. A field's list is portaled outside the
  // panel and a stacked modal is mounted after the one below it, so the modal that sends is the last
  // one open in the document, not the closest panel.
  function sendWithCtrlEnter(event: KeyboardEvent) {
    const ownFooter = footerRef.current;
    const openFooters = document.querySelectorAll("[data-modal-footer]");
    if (
      !isCtrlEnter(event) ||
      ownFooter === null ||
      openFooters[openFooters.length - 1] !== ownFooter
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    ownFooter.querySelector<HTMLElement>('[data-variant="primary"]')?.click();
  }

  function sendWithCtrlEnterFromDialog(event: KeyboardEvent) {
    if ((event.target as Element).getAttribute("role") === "dialog") {
      sendWithCtrlEnter(event);
    }
  }

  return (
    <AriaModalOverlay
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable={false}
      isKeyboardDismissDisabled={!props.closable}
      className="fixed inset-0 z-overlay flex items-center justify-center bg-backdrop"
    >
      <AriaModal
        className={[
          // The max sizes only clip, never stretch, so a panel that fits is unaffected; the
          // backdrop centers the panel, so hitting a 24px cap leaves that clearance on both sides.
          "flex max-h-modal max-w-modal shrink-0 flex-col rounded-xl bg-surface",
          "shadow-xl",
          widthClassName[width],
        ].join(" ")}
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          onKeyDownCapture={sendWithCtrlEnterFromDialog}
        >
          <AriaDialog className="flex min-h-0 flex-1 flex-col outline-none">
            {props.headerLayout === "centered" ? (
              <div
                className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto p-6"
                onKeyDownCapture={sendWithCtrlEnter}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "flex size-14 shrink-0 items-center justify-center rounded-full",
                    toneClassName[tone].surface,
                  ].join(" ")}
                >
                  <span className={iconSlotClassName["3xl"]}>{icon}</span>
                </span>
                <AriaHeading
                  slot="title"
                  className={["text-center text-title", toneClassName[tone].strongText].join(" ")}
                >
                  {title}
                </AriaHeading>
                {children}
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-center gap-4 border-b border-border pt-4 pr-4 pb-4 pl-6">
                  <span
                    aria-hidden="true"
                    className={[
                      "flex size-12 shrink-0 items-center justify-center rounded-xl",
                      toneClassName[tone].surface,
                    ].join(" ")}
                  >
                    <span className={iconSlotClassName.xl}>{icon}</span>
                  </span>
                  <div className="flex flex-1 flex-col gap-1">
                    {context ? <Eyebrow text={context} tone={contextTone} /> : null}
                    <AriaHeading
                      slot="title"
                      className={["text-title", toneClassName[tone].strongText].join(" ")}
                    >
                      {title}
                    </AriaHeading>
                  </div>
                  {props.closable ? <CloseButton onPress={() => onOpenChange(false)} /> : null}
                </div>
                {hasContent(children) && (
                  <div
                    className={[
                      "min-h-0 flex-1 overflow-y-auto",
                      // A column, so a caller's own regions can size themselves against it and
                      // scroll independently; without it, a percentage height inside resolves to
                      // auto and scrolls the whole body as one block.
                      bodyPadding === "none" ? "flex flex-col" : "p-6",
                    ].join(" ")}
                    onKeyDownCapture={sendWithCtrlEnter}
                  >
                    {children}
                  </div>
                )}
              </>
            )}
            {/* The footer repeats the panel's bottom radius: its bone fill would otherwise paint
                square corners over the panel's rounded ones. */}
            <div
              ref={footerRef}
              data-modal-footer
              className="flex shrink-0 items-center gap-3 rounded-b-xl border-t border-border bg-surface-subtle py-4 px-6"
            >
              {footer}
            </div>
          </AriaDialog>
        </div>
      </AriaModal>
    </AriaModalOverlay>
  );
}
