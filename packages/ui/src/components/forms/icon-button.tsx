import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import type { ButtonIcon } from "./button";

const glyphWrapperClassName = "inline-flex size-icon-md shrink-0 *:size-full";

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string };

export type IconButtonProps = Omit<
  AriaButtonProps,
  "className" | "children" | "aria-label" | "aria-labelledby"
> &
  AccessibleName & {
    icon: ButtonIcon;
  };

const className =
  "inline-flex size-control-md shrink-0 items-center justify-center rounded-lg " +
  "border border-border bg-surface text-text-accent " +
  "transition-background-border outline-none " +
  "data-focus-visible:focus-ring " +
  "data-hovered:bg-surface-subtle data-hovered:border-action-soft " +
  "data-disabled:opacity-disabled";

export function IconButton({ icon, ...props }: IconButtonProps) {
  return (
    <AriaButton {...props} className={className}>
      <span className={glyphWrapperClassName}>{icon}</span>
    </AriaButton>
  );
}
