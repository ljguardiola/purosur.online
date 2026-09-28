import { X } from "lucide-react";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
import type { ButtonIcon } from "./Button";

export type ModalWidth = "confirmation" | "standard" | "wide" | "editor";
export type ModalTone = "info" | "success" | "warning" | "error";

// Every tone clears AA text contrast against the panel's white background.
export type ModalContextTone = "default" | "info" | "success" | "warning" | "error";

export type ModalBodyPadding = "default" | "none";

export type ModalHeaderLayout = "leading" | "centered";

type ModalCommonProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  width?: ModalWidth;
  tone: ModalTone;
  icon: ButtonIcon;
  title: string;
  children?: ReactNode;
  footer: ReactNode;
};

type ModalLeadingProps = {
  headerLayout?: "leading";
  context?: string;
  contextTone?: ModalContextTone;
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
  confirmation: "w-[35rem]",
  standard: "w-[40rem]",
  wide: "w-[45rem]",
  editor: "w-[65rem]",
};

const toneMessageBgClassName: Record<ModalTone, string> = {
  info: "bg-info-subtle",
  success: "bg-success-subtle",
  warning: "bg-warning-subtle",
  error: "bg-error-subtle",
};

const toneStrongTextClassName: Record<ModalTone, string> = {
  info: "text-info-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
  error: "text-error-strong",
};

const contextToneClassName: Record<ModalContextTone, string> = {
  default: "text-text-eyebrow",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
};

const headerIconWrapperClassName = "inline-flex size-6 shrink-0 [&>svg]:h-full [&>svg]:w-full";
const centeredHeaderIconWrapperClassName =
  "inline-flex size-7 shrink-0 [&>svg]:h-full [&>svg]:w-full";
const closeIconWrapperClassName = "inline-flex size-5 shrink-0 [&>svg]:h-full [&>svg]:w-full";

// Children.toArray drops null/undefined/boolean children but keeps a fragment as one child even
// when everything inside it was dropped, so fragments are looked into.
function hasContent(node: ReactNode): boolean {
  return Children.toArray(node).some((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? hasContent(child.props.children)
      : true,
  );
}

const closeButtonClassName =
  "flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-text-subtle " +
  "transition-[background-color] outline-none data-[hovered]:bg-surface-soft " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-focus";

export function Modal(props: ModalProps) {
  const {
    isOpen,
    onOpenChange,
    width = "standard",
    tone,
    icon,
    context,
    contextTone = "default",
    title,
    children,
    bodyPadding = "default",
    footer,
  } = props;

  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={false}
      isKeyboardDismissDisabled={!props.closable}
      className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop"
    >
      <AriaModal
        className={[
          // max-height only clips, never stretches, so short content is unaffected; the backdrop
          // centers the panel, so hitting the 24px cap leaves that clearance on both sides.
          "flex max-h-[calc(100vh-3rem)] shrink-0 flex-col rounded-[0.75rem] bg-surface",
          "shadow-[0_24px_64px_var(--palette-neutral-900-a30)]",
          widthClassName[width],
        ].join(" ")}
      >
        <AriaDialog className="flex min-h-0 flex-1 flex-col">
          {props.headerLayout === "centered" ? (
            <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto p-6">
              <span
                aria-hidden="true"
                className={[
                  "flex size-14 shrink-0 items-center justify-center rounded-full",
                  toneMessageBgClassName[tone],
                  toneStrongTextClassName[tone],
                ].join(" ")}
              >
                <span className={centeredHeaderIconWrapperClassName}>{icon}</span>
              </span>
              <AriaHeading
                slot="title"
                className={["text-center text-2xl font-bold", toneStrongTextClassName[tone]].join(
                  " ",
                )}
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
                    "flex size-12 shrink-0 items-center justify-center rounded-[0.75rem]",
                    toneMessageBgClassName[tone],
                    toneStrongTextClassName[tone],
                  ].join(" ")}
                >
                  <span className={headerIconWrapperClassName}>{icon}</span>
                </span>
                <div className="flex flex-1 flex-col gap-1">
                  {context && (
                    <p
                      className={[
                        "text-xs font-bold uppercase",
                        contextToneClassName[contextTone],
                      ].join(" ")}
                    >
                      {context}
                    </p>
                  )}
                  <AriaHeading
                    slot="title"
                    className={["text-2xl font-bold", toneStrongTextClassName[tone]].join(" ")}
                  >
                    {title}
                  </AriaHeading>
                </div>
                {props.closable && (
                  <AriaButton
                    aria-label="Cerrar"
                    onPress={() => onOpenChange(false)}
                    className={closeButtonClassName}
                  >
                    <span className={closeIconWrapperClassName}>
                      <X aria-hidden="true" />
                    </span>
                  </AriaButton>
                )}
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
                >
                  {children}
                </div>
              )}
            </>
          )}
          {/* The footer repeats the panel's bottom radius: its bone fill would otherwise paint
              square corners over the panel's rounded ones. */}
          <div className="flex shrink-0 items-center gap-3 rounded-b-[0.75rem] border-t border-border bg-surface-subtle py-4 px-6">
            {footer}
          </div>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
