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

// The set of package text tones a caller may use to color the context line instead of the
// default earth: the "-ui" tones already carry AA text contrast on the panel's white background
// (see contrast.test.ts's textTones).
export type ModalContextTone =
  | "brand-blue-ui"
  | "brand-green-ui"
  | "brand-earth-ui"
  | "status-error-ui"
  | "status-warning-ui";

// "none" is for a caller that lays out its own edge-to-edge regions (e.g. the role editor's areas
// and detail panes) instead of a single padded block of content.
export type ModalBodyPadding = "default" | "none";

// "centered" stacks a circular icon, a centered title and the body in one column, with no context
// line, no close button and no divider: the design's own confirmation-dialog layout (e.g.
// "¿Guardar los cambios?"), distinct from every other modal's leading icon-beside-title header.
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

// The centered layout draws no context line and lays its body out in its own column, so the
// props that only style those leading-layout regions do not compile there.
type ModalCenteredProps = {
  headerLayout: "centered";
  context?: undefined;
  contextTone?: undefined;
  bodyPadding?: undefined;
};

// A closable modal's close button needs its own accessible name (see IconButton's aria-label),
// and a non-closable modal renders no close button at all, so asking for a label without
// `closable`, or `closable` without a label, does not compile. The centered layout never draws a
// close button, so there `closable` only lets Escape dismiss it and a label does not compile.
export type ModalProps = ModalCommonProps &
  (
    | (ModalLeadingProps & { closable: true; closeLabel: string })
    | (ModalLeadingProps & { closable?: false; closeLabel?: undefined })
    | (ModalCenteredProps & { closable?: boolean; closeLabel?: undefined })
  );

const widthClassName: Record<ModalWidth, string> = {
  confirmation: "w-[35rem]",
  standard: "w-[40rem]",
  wide: "w-[45rem]",
  // The role editor's own width (design.pen `bnyPf`), wide enough for its areas pane plus the
  // selected area's permissions to sit side by side.
  editor: "w-[65rem]",
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
// The centered layout's own icon box is bigger (56px circle), so its icon glyph keeps the leading
// layout's 1:2 ratio to its box (24px in 48px) rather than looking undersized inside it.
const centeredHeaderIconWrapperClassName =
  "inline-flex size-7 shrink-0 [&>svg]:h-full [&>svg]:w-full";
const closeIconWrapperClassName = "inline-flex size-5 shrink-0 [&>svg]:h-full [&>svg]:w-full";

// Whether a caller's body has anything to render: Children.toArray drops null, undefined and
// booleans (a conditional that currently shows nothing), but keeps a fragment as one child even
// when everything inside it was dropped, so fragments are looked into.
function hasContent(node: ReactNode): boolean {
  return Children.toArray(node).some((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? hasContent(child.props.children)
      : true,
  );
}

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
    bodyPadding = "default",
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
              {hasContent(children) && (
                <div
                  className={[
                    "min-h-0 flex-1 overflow-y-auto",
                    // A flush body is a column so a caller's own regions can fill it and scroll
                    // on their own: the panel only caps its height, so a percentage height inside
                    // the body would resolve to auto and scroll the whole body as one block.
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
          <div className="flex shrink-0 items-center gap-3 rounded-b-[0.75rem] border-t border-line bg-surface-bone py-4 px-6">
            {footer}
          </div>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
