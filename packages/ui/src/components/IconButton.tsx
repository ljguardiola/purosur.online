import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import type { ButtonIcon } from "./Button";

// The icon's size is fixed by this span's CSS, not by cloning a `size` prop — only lucide icons
// interpret one.
const glyphWrapperClassName = "inline-flex size-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full";

// This button shows no text, so the caller must name it with aria-label or aria-labelledby;
// supplying neither does not compile.
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
  "border border-line bg-surface-white text-brand-blue-strong " +
  "transition-[background-color,border-color] outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong " +
  "data-[hovered]:bg-surface-bone data-[hovered]:border-blue-soft " +
  "data-[disabled]:opacity-[0.45]";

export function IconButton({ icon, ...props }: IconButtonProps) {
  return (
    <AriaButton {...props} className={className}>
      <span className={glyphWrapperClassName}>{icon}</span>
    </AriaButton>
  );
}
