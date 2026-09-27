import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";

export type ButtonVariant = "primary" | "secondary" | "text";
export type ButtonSize = "small" | "medium" | "large" | "sale";
export type ButtonTone = "default" | "destructive";

export type ButtonTextSize = Extract<ButtonSize, "small" | "large">;

// Only lucide icons interpret a numeric `size` prop; a plain <svg> would ignore it or reject it
// as an invalid DOM attribute. The button imposes size with CSS instead, so `size` is left out of
// the type a caller's icon element can declare.
export type ButtonIcon = ReactElement<{ className?: string }>;

// react-aria-components' AriaButtonProps.children also accepts a render-prop function for
// hover/focus-driven content, which this button's fixed icon+text layout does not support.
type ButtonCommonProps = Omit<AriaButtonProps, "className" | "children"> & {
  // TypeScript can't tell a label from other content, so an empty string or an icon passed as
  // children still compiles; icon-only actions belong to IconButton, which requires an aria-label.
  children: Exclude<ReactNode, null | undefined | boolean>;
  fullWidth?: boolean;
};

export type ButtonProps = ButtonCommonProps &
  (
    | { variant?: "primary"; tone?: ButtonTone; size?: ButtonSize; icon?: ButtonIcon }
    | { variant: "secondary"; tone?: ButtonTone; size?: ButtonSize; icon?: ButtonIcon }
    | { variant: "text"; tone: "destructive"; size?: ButtonTextSize; icon?: undefined }
  );

// min-w-0 overrides a flex item's default min-width of auto, which otherwise refuses to shrink a
// button below its label's own content width, blocking truncation. max-w-full stops a stretched
// button from spilling past a container narrower than its label, since grow alone only holds it
// back inside a row.
const widthClassName = {
  content: "inline-flex min-w-0 max-w-full",
  full: "flex min-w-0 max-w-full grow basis-0",
} as const;

const baseClassName =
  "items-center justify-center px-4 font-sans " +
  // Excludes outline-color from the transition so the focus ring appears instantly, not mid-fade.
  "transition-[background-color,color,border-color] outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong " +
  "data-[disabled]:opacity-[0.45]";

const sizeClassName: Record<ButtonSize, string> = {
  small: "h-[2.5rem] text-base",
  medium: "h-[3rem] text-base",
  large: "h-[3.5rem] text-lg",
  sale: "h-[4.5rem] text-2xl",
};

// min-height and max-height pin a stretched button's height; without them flex-grow would stretch
// it along whichever axis its container runs, as tall as a vertical stack or as short as its text.
const stretchedHeightClassName: Record<ButtonSize, string> = {
  small: "min-h-[2.5rem] max-h-[2.5rem]",
  medium: "min-h-[3rem] max-h-[3rem]",
  large: "min-h-[3.5rem] max-h-[3.5rem]",
  sale: "min-h-[4.5rem] max-h-[4.5rem]",
};

const defaultSize: { primary: ButtonSize; secondary: ButtonSize; text: ButtonTextSize } = {
  primary: "medium",
  secondary: "medium",
  text: "small",
};

const primaryToneClassName: Record<ButtonTone, string> = {
  default: "bg-brand-blue-ui data-[hovered]:bg-brand-blue-strong",
  destructive: "bg-status-error-ui data-[hovered]:bg-status-error-strong",
};

const secondaryToneClassName: Record<ButtonTone, string> = {
  default: "border-brand-earth-ui text-ink",
  destructive: "border-status-error-ui text-status-error-ui",
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: "gap-3 rounded-lg font-bold text-surface-white",
  secondary: "gap-2 rounded-md border bg-transparent font-bold data-[hovered]:bg-surface-bone",
  text: "gap-2 rounded-md bg-transparent font-semibold text-status-error-ui data-[hovered]:bg-surface-bone",
};

const iconWrapperClassName: Record<ButtonVariant, string> = {
  primary: "inline-flex size-6 shrink-0 [&>svg]:h-full [&>svg]:w-full",
  secondary: "inline-flex size-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full",
  text: "inline-flex size-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full",
};

export function Button({
  variant = "primary",
  size,
  tone = "default",
  icon,
  fullWidth = false,
  children,
  ...props
}: ButtonProps) {
  const resolvedSize = size ?? defaultSize[variant];
  const className = [
    widthClassName[fullWidth ? "full" : "content"],
    baseClassName,
    sizeClassName[resolvedSize],
    fullWidth ? stretchedHeightClassName[resolvedSize] : "",
    variantClassName[variant],
    variant === "primary" ? primaryToneClassName[tone] : "",
    variant === "secondary" ? secondaryToneClassName[tone] : "",
  ]
    .filter(Boolean)
    .join(" ");

  const glyph = variant === "text" ? <X aria-hidden="true" /> : icon;
  const sizedIcon = glyph ? <span className={iconWrapperClassName[variant]}>{glyph}</span> : null;

  return (
    <AriaButton {...props} className={className}>
      {variant !== "primary" && sizedIcon}
      {/* truncate on this justify-center flex container itself would clip both ends with no
          ellipsis; it needs its own box to truncate correctly. */}
      <span className="truncate">{children}</span>
      {variant === "primary" && sizedIcon}
    </AriaButton>
  );
}
