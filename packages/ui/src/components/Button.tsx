import type { ReactElement, ReactNode } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "small" | "medium" | "large" | "sale";
export type ButtonTone = "default" | "destructive";

// The button imposes its icon's size with CSS (see iconWrapperClassName below) instead of
// cloning a `size` prop onto the caller's element: cloning only works when the element happens
// to interpret a numeric `size` prop the way lucide icons do, and would otherwise leave the
// guarantee unmet (a plain <svg>) or forward an invalid attribute to the DOM. `size` is left out
// of the type a caller's icon element can declare, since this component never reads or sets it.
export type ButtonIcon = ReactElement<{ className?: string }>;

// AriaButtonProps.children also accepts a render-prop function for hover/focus-driven content,
// which this button's fixed icon+text layout does not support, so it is narrowed to plain nodes.
type ButtonCommonProps = Omit<AriaButtonProps, "className" | "children"> & {
  size?: ButtonSize;
  icon?: ButtonIcon;
  // Required, so leaving out the label doesn't compile. The type can't tell a label from other
  // content, so an empty string or an icon passed as children still compiles; icon-only actions
  // belong to IconButton, which requires an aria-label.
  children: Exclude<ReactNode, null | undefined | boolean>;
};

// The design has no destructive secondary button, so `tone` is only representable on the
// primary variant: asking for `tone="destructive"` on the secondary variant fails to compile
// instead of being silently ignored.
export type ButtonProps = ButtonCommonProps &
  ({ variant?: "primary"; tone?: ButtonTone } | { variant: "secondary"; tone?: undefined });

const baseClassName =
  "inline-flex items-center justify-center px-5 font-sans font-bold " +
  // Excludes outline-color from the transition so the focus ring appears instantly, not mid-fade.
  "transition-[background-color,color,border-color] outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-brand-blue-strong " +
  "data-[disabled]:opacity-[0.45]";

const sizeClassName: Record<ButtonSize, string> = {
  small: "h-[2.5rem] text-base",
  medium: "h-[3rem] text-base",
  large: "h-[3.5rem] text-lg",
  sale: "h-[4.5rem] text-2xl",
};

// Only the primary variant carries a tone: the secondary button has no destructive rendering.
const primaryToneClassName: Record<ButtonTone, string> = {
  default: "bg-brand-blue-ui data-[hovered]:bg-brand-blue-strong",
  destructive: "bg-status-error-ui data-[hovered]:bg-status-error-strong",
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: "gap-3 rounded-lg text-surface-white",
  secondary:
    "gap-2 rounded-md border border-brand-earth-ui bg-transparent text-ink data-[hovered]:bg-surface-bone",
};

// Wraps the icon in a fixed-size box and stretches the icon to fill it, so the box's own CSS
// size is what the DOM renders at regardless of the icon's own markup or props.
const iconWrapperClassName: Record<ButtonVariant, string> = {
  primary: "inline-flex size-6 shrink-0 [&>svg]:h-full [&>svg]:w-full",
  secondary: "inline-flex size-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full",
};

export function Button({
  variant = "primary",
  size = "medium",
  tone = "default",
  icon,
  children,
  ...props
}: ButtonProps) {
  const className = [
    baseClassName,
    sizeClassName[size],
    variantClassName[variant],
    variant === "primary" ? primaryToneClassName[tone] : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sizedIcon = icon ? <span className={iconWrapperClassName[variant]}>{icon}</span> : null;

  return (
    <AriaButton {...props} className={className}>
      {variant === "secondary" && sizedIcon}
      {children}
      {variant === "primary" && sizedIcon}
    </AriaButton>
  );
}
