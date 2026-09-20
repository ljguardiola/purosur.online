import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";

export type ButtonVariant = "primary" | "secondary" | "text";
export type ButtonSize = "small" | "medium" | "large" | "sale";
export type ButtonTone = "default" | "destructive";

// The text variant is drawn at two heights only: 40px with a 16px label, and 56px with an 18px
// label where it sits beside a button of that height. The sizes in between and above are never
// drawn for it, so they are not representable.
export type ButtonTextSize = Extract<ButtonSize, "small" | "large">;

// The button imposes its icon's size with CSS (see iconWrapperClassName below) instead of
// cloning a `size` prop onto the caller's element: cloning only works when the element happens
// to interpret a numeric `size` prop the way lucide icons do, and would otherwise leave the
// guarantee unmet (a plain <svg>) or forward an invalid attribute to the DOM. `size` is left out
// of the type a caller's icon element can declare, since this component never reads or sets it.
export type ButtonIcon = ReactElement<{ className?: string }>;

// AriaButtonProps.children also accepts a render-prop function for hover/focus-driven content,
// which this button's fixed icon+text layout does not support, so it is narrowed to plain nodes.
type ButtonCommonProps = Omit<AriaButtonProps, "className" | "children"> & {
  // Required, so leaving out the label doesn't compile. The type can't tell a label from other
  // content, so an empty string or an icon passed as children still compiles; icon-only actions
  // belong to IconButton, which requires an aria-label.
  children: Exclude<ReactNode, null | undefined | boolean>;
  // The design stretches a button across the row it sits in: alone it takes the whole row, beside
  // a button of its own width it takes what that one leaves, and beside another stretched one they
  // split the row evenly. All three follow from the button asking for its container's full width
  // and the row shrinking it back to what is free, so there is one option rather than three.
  // A vertical stack already gives a button its full width, so this is not needed there.
  fullWidth?: boolean;
};

// Each variant admits only the combinations the design draws for it, so asking for one it has no
// drawing for fails to compile instead of being silently ignored: there is no destructive
// secondary button; the text variant exists in no other tone, at no other size, and always with
// the same "x", so it carries that icon itself rather than taking one from the caller.
export type ButtonProps = ButtonCommonProps &
  (
    | { variant?: "primary"; tone?: ButtonTone; size?: ButtonSize; icon?: ButtonIcon }
    | { variant: "secondary"; tone?: undefined; size?: ButtonSize; icon?: ButtonIcon }
    | { variant: "text"; tone: "destructive"; size?: ButtonTextSize; icon?: undefined }
  );

// Block-level when stretched, inline when not: `w-full` needs a box that owns a line of its own,
// and `justify-center` keeps the label and icon together in the middle of whatever width results.
const widthClassName = { content: "inline-flex", full: "flex w-full" } as const;

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

// The medium the other variants default to is never drawn for the text variant, so it defaults
// to the smaller of its own two sizes, the one the design uses everywhere but a modal footer.
const defaultSize: { primary: ButtonSize; secondary: ButtonSize; text: ButtonTextSize } = {
  primary: "medium",
  secondary: "medium",
  text: "small",
};

// Only the primary variant carries a tone: the secondary button has no destructive rendering,
// and the text variant is destructive by definition, carrying its color in its own classes.
const primaryToneClassName: Record<ButtonTone, string> = {
  default: "bg-brand-blue-ui data-[hovered]:bg-brand-blue-strong",
  destructive: "bg-status-error-ui data-[hovered]:bg-status-error-strong",
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: "gap-3 rounded-lg font-bold text-surface-white",
  secondary:
    "gap-2 rounded-md border border-brand-earth-ui bg-transparent font-bold text-ink data-[hovered]:bg-surface-bone",
  // With no background and no border of its own, this form has no drawn corner radius: the one
  // here rounds the bone background it takes on hover, so it is the secondary button's.
  text: "gap-2 rounded-md bg-transparent font-semibold text-status-error-ui data-[hovered]:bg-surface-bone",
};

// Wraps the icon in a fixed-size box and stretches the icon to fill it, so the box's own CSS
// size is what the DOM renders at regardless of the icon's own markup or props.
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
  const className = [
    widthClassName[fullWidth ? "full" : "content"],
    baseClassName,
    sizeClassName[size ?? defaultSize[variant]],
    variantClassName[variant],
    variant === "primary" ? primaryToneClassName[tone] : "",
  ]
    .filter(Boolean)
    .join(" ");

  // The text variant's "x" is part of the form, not a choice: it is hidden from assistive
  // technology so the button's accessible name stays the label alone.
  const glyph = variant === "text" ? <X aria-hidden="true" /> : icon;
  const sizedIcon = glyph ? <span className={iconWrapperClassName[variant]}>{glyph}</span> : null;

  return (
    <AriaButton {...props} className={className}>
      {variant !== "primary" && sizedIcon}
      {children}
      {variant === "primary" && sizedIcon}
    </AriaButton>
  );
}
