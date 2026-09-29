import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { type Icon, iconSlotClassName } from "../shared/icon";
import type { LoadStatus } from "../shared/load-status";

export type ButtonVariant = "primary" | "secondary" | "text";
export type ButtonSize = "small" | "medium" | "large" | "sale";

export type ButtonTextSize = Extract<ButtonSize, "small" | "large">;

type ButtonCommonProps = Pick<AriaButtonProps, "onPress" | "type"> & {
  disabled?: boolean;
  dataStatus?: LoadStatus;
  // TypeScript can't tell a label from other content, so an empty string or an icon passed as
  // children still compiles; icon-only actions belong to IconButton, which requires an aria-label.
  children: Exclude<ReactNode, null | undefined | boolean>;
  fullWidth?: boolean;
};

export type ButtonProps = ButtonCommonProps &
  (
    | { variant?: "primary"; destructive?: boolean; size?: ButtonSize; icon?: Icon }
    | { variant: "secondary"; destructive?: boolean; size?: ButtonSize; icon?: Icon }
    | { variant: "text"; destructive: true; size?: ButtonTextSize; icon?: undefined }
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
  "transition-background-text-border outline-none " +
  "data-focus-visible:focus-ring " +
  "data-disabled:opacity-disabled";

const sizeClassName: Record<ButtonSize, string> = {
  small: "h-control-lg text-body",
  medium: "h-control-2xl text-body",
  large: "h-control-4xl text-subheading",
  sale: "h-control-6xl text-title",
};

// min-height and max-height pin a stretched button's height; without them flex-grow would stretch
// it along whichever axis its container runs, as tall as a vertical stack or as short as its text.
const stretchedHeightClassName: Record<ButtonSize, string> = {
  small: "min-h-control-lg max-h-control-lg",
  medium: "min-h-control-2xl max-h-control-2xl",
  large: "min-h-control-4xl max-h-control-4xl",
  sale: "min-h-control-6xl max-h-control-6xl",
};

const defaultSize: { primary: ButtonSize; secondary: ButtonSize; text: ButtonTextSize } = {
  primary: "medium",
  secondary: "medium",
  text: "small",
};

const primaryColorClassName = {
  regular: "bg-action data-hovered:bg-action-strong",
  destructive: "bg-error data-hovered:bg-error-strong",
};

const secondaryColorClassName = {
  regular: "border-border-accent text-text",
  destructive: "border-error text-error",
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: "gap-3 rounded-lg font-bold text-text-inverse",
  secondary: "gap-2 rounded-md border bg-transparent font-bold data-hovered:bg-surface-subtle",
  text: "gap-2 rounded-md bg-transparent font-semibold text-error data-hovered:bg-surface-subtle",
};

const iconWrapperClassName: Record<ButtonVariant, string> = {
  primary: iconSlotClassName.xl,
  secondary: iconSlotClassName.md,
  text: iconSlotClassName.md,
};

export function Button({
  variant = "primary",
  size,
  destructive = false,
  icon,
  fullWidth = false,
  children,
  disabled = false,
  dataStatus,
  ...props
}: ButtonProps) {
  const color = destructive ? "destructive" : "regular";
  const resolvedSize = size ?? defaultSize[variant];
  const className = [
    widthClassName[fullWidth ? "full" : "content"],
    baseClassName,
    sizeClassName[resolvedSize],
    fullWidth ? stretchedHeightClassName[resolvedSize] : "",
    variantClassName[variant],
    variant === "primary" ? primaryColorClassName[color] : "",
    variant === "secondary" ? secondaryColorClassName[color] : "",
  ]
    .filter(Boolean)
    .join(" ");

  const glyph = variant === "text" ? <X aria-hidden="true" /> : icon;
  const sizedIcon = glyph ? <span className={iconWrapperClassName[variant]}>{glyph}</span> : null;

  return (
    <AriaButton
      {...props}
      isDisabled={disabled || (dataStatus !== undefined && dataStatus !== "loaded")}
      className={className}
    >
      {variant !== "primary" && sizedIcon}
      {/* truncate on this justify-center flex container itself would clip both ends with no
          ellipsis; it needs its own box to truncate correctly. */}
      <span className="truncate">{children}</span>
      {variant === "primary" && sizedIcon}
    </AriaButton>
  );
}
