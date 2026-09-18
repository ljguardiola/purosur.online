import { X } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
import type { ButtonIcon } from "./Button";

export type ModalWidth = "confirmation" | "standard" | "wide";
export type ModalTone = "info" | "success" | "warning" | "error";

// The set of package text tones a caller may use to color the context line instead of the
// default earth: the "-ui" tones already carry AA text contrast on the panel's white background
// (see contrast.test.ts's textTones).
export type ModalContextTone =
  | "brand-blue-ui"
  | "brand-green-ui"
  | "brand-earth-ui"
  | "status-error-ui"
  | "status-warning-ui";

type ModalCommonProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  width?: ModalWidth;
  tone: ModalTone;
  icon: ButtonIcon;
  context?: string;
  contextTone?: ModalContextTone;
  title: string;
  children: ReactNode;
  footer: ReactNode;
};

// A closable modal's close button needs its own accessible name (see IconButton's aria-label),
// and a non-closable modal renders no close button at all, so asking for a label without
// `closable`, or `closable` without a label, does not compile.
export type ModalProps = ModalCommonProps &
  ({ closable: true; closeLabel: string } | { closable?: false; closeLabel?: undefined });

const widthClassName: Record<ModalWidth, string> = {
  confirmation: "w-[35rem]",
  standard: "w-[40rem]",
  wide: "w-[45rem]",
};

const toneMessageBgClassName: Record<ModalTone, string> = {
  info: "bg-brand-blue-message-bg",
  success: "bg-brand-green-message-bg",
  warning: "bg-status-warning-message-bg",
  error: "bg-status-error-message-bg",
};

const toneStrongTextClassName: Record<ModalTone, string> = {
  info: "text-brand-blue-strong",
  success: "text-brand-green-strong",
  warning: "text-status-warning-strong",
  error: "text-status-error-strong",
};

const contextToneClassName: Record<ModalContextTone, string> = {
  "brand-blue-ui": "text-brand-blue-ui",
  "brand-green-ui": "text-brand-green-ui",
  "brand-earth-ui": "text-brand-earth-ui",
  "status-error-ui": "text-status-error-ui",
  "status-warning-ui": "text-status-warning-ui",
};

// See Button.tsx's iconWrapperClassName: each glyph's size is imposed by its own wrapper's CSS,
// never by cloning a `size` prop onto the caller's (or this component's own) icon element.
const headerIconWrapperClassName = "inline-flex size-6 shrink-0 [&>svg]:h-full [&>svg]:w-full";
const closeIconWrapperClassName = "inline-flex size-5 shrink-0 [&>svg]:h-full [&>svg]:w-full";

const closeButtonClassName =
  "flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-bone text-ink-secondary " +
  "transition-[background-color] outline-none data-[hovered]:bg-surface-sand " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

export function Modal(props: ModalProps) {
  const {
    isOpen,
    onOpenChange,
    width = "standard",
    tone,
    icon,
    context,
    contextTone = "brand-earth-ui",
    title,
    children,
    footer,
  } = props;

  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={false}
      isKeyboardDismissDisabled={!props.closable}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-backdrop"
    >
      <AriaModal
        className={[
          // The panel never grows taller than the viewport minus 24px (1.5rem) of clearance
          // above and below it: with the backdrop centering it, hitting the cap leaves exactly
          // that clearance on both sides; short content is unaffected since max-height only
          // clips, it never stretches a shorter panel to fill it.
          "flex max-h-[calc(100vh-3rem)] shrink-0 flex-col rounded-[0.75rem] bg-surface-white",
          "shadow-[0_24px_64px_var(--color-ink-panel-shadow)]",
          widthClassName[width],
        ].join(" ")}
      >
        <AriaDialog className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-4 border-b border-line pt-4 pr-4 pb-4 pl-6">
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
                aria-label={props.closeLabel}
                onPress={() => onOpenChange(false)}
                className={closeButtonClassName}
              >
                <span className={closeIconWrapperClassName}>
                  <X aria-hidden="true" />
                </span>
              </AriaButton>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
          <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface-bone py-4 px-6">
            {footer}
          </div>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
