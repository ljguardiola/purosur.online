import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { type Icon, iconSlotClassName } from "../shared/icon";

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string };

export type IconButtonProps = Pick<AriaButtonProps, "onPress"> &
  AccessibleName & {
    icon: Icon;
    disabled?: boolean;
  };

const className =
  "inline-flex size-control-md shrink-0 items-center justify-center rounded-lg " +
  "border border-border bg-surface text-text-accent " +
  "transition-background-border outline-none " +
  "data-focus-visible:focus-ring " +
  "data-hovered:bg-surface-subtle data-hovered:border-action-soft " +
  "data-disabled:opacity-disabled";

export function IconButton({ icon, disabled = false, ...props }: IconButtonProps) {
  return (
    <AriaButton {...props} isDisabled={disabled} className={className}>
      <span className={iconSlotClassName.md}>{icon}</span>
    </AriaButton>
  );
}
