import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { type Icon, iconSlotClassName } from "../shared/icon";

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string };

type IconButtonVariant = "bordered" | "subtle";

export type IconButtonProps = Pick<AriaButtonProps, "onPress"> &
  AccessibleName & {
    icon: Icon;
    variant?: IconButtonVariant;
    disabled?: boolean;
  };

const baseClassName =
  "inline-flex shrink-0 items-center justify-center outline-none " +
  "data-focus-visible:focus-ring " +
  "data-disabled:opacity-disabled";

const variantClassName: Record<IconButtonVariant, string> = {
  bordered:
    "size-control-md rounded-lg border border-border bg-surface text-text-accent " +
    "transition-background-border " +
    "data-hovered:bg-surface-subtle data-hovered:border-action-soft",
  subtle:
    "size-8 rounded-md text-text-subtle " +
    "transition-colors " +
    "data-hovered:bg-surface-soft data-hovered:text-text-accent",
};

export function IconButton({
  icon,
  variant = "bordered",
  disabled = false,
  ...props
}: IconButtonProps) {
  return (
    <AriaButton
      {...props}
      isDisabled={disabled}
      className={`${baseClassName} ${variantClassName[variant]}`}
    >
      <span className={iconSlotClassName.md}>{icon}</span>
    </AriaButton>
  );
}
