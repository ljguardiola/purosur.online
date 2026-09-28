import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import type { ButtonIcon } from "./Button";

const glyphWrapperClassName = "inline-flex size-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full";

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
  "inline-flex h-[2.375rem] w-[2.375rem] shrink-0 items-center justify-center rounded-lg " +
  "border border-border bg-surface text-text-accent " +
  "transition-[background-color,border-color] outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-focus " +
  "data-[hovered]:bg-surface-subtle data-[hovered]:border-action-soft " +
  "data-[disabled]:opacity-[0.45]";

export function IconButton({ icon, ...props }: IconButtonProps) {
  return (
    <AriaButton {...props} className={className}>
      <span className={glyphWrapperClassName}>{icon}</span>
    </AriaButton>
  );
}
