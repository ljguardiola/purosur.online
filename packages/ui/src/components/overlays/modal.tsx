import {
  Children,
  Fragment,
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import { FocusScope, useFocusManager } from "react-aria";
import {
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
import { Eyebrow } from "../layout/eyebrow";
import { CloseButton } from "../shared/close-button";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { useKeyboardScrollableRegion } from "../shared/keyboard-scrollable-region";
import { moveFocus } from "../shared/moved-focus";
import { type NoticeTone, type Tone, toneClassName } from "../shared/tone";
import { type ModalPartFocus, ModalPartFocusContext } from "./modal-part";

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
  escapeKeycap?: boolean;
};

type ModalCenteredProps = {
  headerLayout: "centered";
  context?: undefined;
  contextTone?: undefined;
  bodyPadding?: undefined;
  escapeKeycap?: undefined;
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

type CtrlEnterEvent = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "preventDefault" | "stopPropagation"
> & { target: EventTarget | null };

function isCtrlEnter(event: CtrlEnterEvent): boolean {
  return (
    event.key === "Enter" && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
  );
}

const fieldRoles = new Set(["textbox", "searchbox", "combobox", "spinbutton", "radio"]);

const nonFieldInputTypes = new Set([
  "checkbox",
  "range",
  "file",
  "color",
  "button",
  "submit",
  "reset",
  "image",
]);

function isField(element: Element): boolean {
  if (
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    element.readOnly
  ) {
    return false;
  }
  // A select's trigger is a button that opens its list of options.
  if (element.getAttribute("aria-haspopup") === "listbox") {
    return true;
  }
  const role = element.getAttribute("role");
  if (role !== null) {
    return fieldRoles.has(role);
  }
  if (element instanceof HTMLInputElement) {
    return !nonFieldInputTypes.has(element.type);
  }
  return element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

// Runs before the dialog's own effect, which focuses the dialog only when nothing inside it holds
// the focus yet. A field that appears later, once its data loads, takes the focus only while the
// dialog still holds it.
function FocusFirstField({ bodyRef }: { bodyRef: RefObject<HTMLDivElement | null> }) {
  const focusManager = useFocusManager();
  useEffect(() => {
    const body = bodyRef.current;
    if (body === null || focusManager === undefined) {
      return;
    }
    const focusFirstField = () =>
      moveFocus(() => focusManager.focusFirst({ tabbable: true, accept: isField }));
    if (!body.contains(document.activeElement)) {
      focusFirstField();
    }
    const dialog = body.closest('[role="dialog"]');
    const observer = new MutationObserver(() => {
      if (document.activeElement === dialog) {
        focusFirstField();
      }
    });
    observer.observe(body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [bodyRef, focusManager]);
  return null;
}

export function FieldFocusingContent({
  bodyRef,
  focusPart,
  children,
}: {
  bodyRef: RefObject<HTMLDivElement | null>;
  focusPart: ModalPartFocus;
  children: ReactNode;
}) {
  return (
    <FocusScope>
      {/* react-aria's focusFirst fails on a scope with no element in it, as when the body's content
          renders nothing. */}
      <div className="contents">
        <ModalPartFocusContext value={focusPart}>{children}</ModalPartFocusContext>
      </div>
      <FocusFirstField bodyRef={bodyRef} />
    </FocusScope>
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
  const focusedPartRef = useRef<{
    focused: EventTarget;
    part: HTMLElement;
    action: HTMLElement;
  } | null>(null);
  const focusPart: ModalPartFocus = (focused, part, action) => {
    focusedPartRef.current = { focused, part, action };
  };
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { observeOverflow, regionProps, focusClassName } = useKeyboardScrollableRegion(titleId);

  function observeBody(body: HTMLDivElement | null) {
    bodyRef.current = body;
    const stopObserving = observeOverflow(body);
    return () => {
      stopObserving?.();
      bodyRef.current = null;
    };
  }

  // Capturing, because react-aria's fields stop the keys they handle from bubbling; listening on the
  // body leaves the header's and footer's own buttons out. A field's list is portaled outside the
  // panel and a stacked modal is mounted after the one below it, so the modal that sends is the last
  // one open in the document, not the closest panel.
  function sendWithCtrlEnter(event: CtrlEnterEvent) {
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
    const action =
      focusedPartAction(event.target) ??
      ownFooter.querySelector<HTMLElement>('[data-variant="primary"]');
    action?.click();
  }

  // A part's field, or its portaled list, is the element that took the focus last inside it; a
  // focused element that left the document without a blur no longer counts.
  function focusedPartAction(target: EventTarget | null): HTMLElement | null {
    const focusedPart = focusedPartRef.current;
    if (
      focusedPart === null ||
      focusedPart.focused !== target ||
      !(target instanceof Element) ||
      (focusedPart.part.contains(target) && !isField(target))
    ) {
      return null;
    }
    return focusedPart.action.querySelector<HTMLElement>("[data-variant]");
  }

  // The dialog itself holds the focus in a modal with no field, and before a field that loads late
  // appears; a key pressed there reaches none of the regions above.
  function listenToCtrlEnterOnDialog(dialog: HTMLElement | null) {
    if (dialog === null) {
      return;
    }
    const listener = (event: globalThis.KeyboardEvent) => {
      if (event.target === dialog) {
        sendWithCtrlEnter(event);
      }
    };
    dialog.addEventListener("keydown", listener);
    return () => dialog.removeEventListener("keydown", listener);
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
        <AriaDialog
          ref={listenToCtrlEnterOnDialog}
          className="flex min-h-0 flex-1 flex-col outline-none"
        >
          {props.headerLayout === "centered" ? (
            <div
              ref={observeBody}
              {...regionProps}
              className={[
                "flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto p-6",
                focusClassName,
              ].join(" ")}
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
                id={titleId}
                slot="title"
                className={["text-center text-title", toneClassName[tone].strongText].join(" ")}
              >
                {title}
              </AriaHeading>
              <FieldFocusingContent bodyRef={bodyRef} focusPart={focusPart}>
                {children}
              </FieldFocusingContent>
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
                    id={titleId}
                    slot="title"
                    className={["text-title", toneClassName[tone].strongText].join(" ")}
                  >
                    {title}
                  </AriaHeading>
                </div>
                {props.closable ? (
                  <CloseButton
                    onPress={() => onOpenChange(false)}
                    escapeKeycap={props.escapeKeycap ?? false}
                  />
                ) : null}
              </div>
              {hasContent(children) && (
                <div
                  ref={observeBody}
                  {...regionProps}
                  className={[
                    "min-h-0 flex-1 overflow-y-auto",
                    focusClassName,
                    // A column, so a caller's own regions can size themselves against it and
                    // scroll independently; without it, a percentage height inside resolves to
                    // auto and scrolls the whole body as one block.
                    bodyPadding === "none" ? "flex flex-col" : "p-6",
                  ].join(" ")}
                  onKeyDownCapture={sendWithCtrlEnter}
                >
                  <FieldFocusingContent bodyRef={bodyRef} focusPart={focusPart}>
                    {children}
                  </FieldFocusingContent>
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
      </AriaModal>
    </AriaModalOverlay>
  );
}
