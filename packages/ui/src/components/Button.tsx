import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";

export type ButtonVariant = "primary" | "secondary";

export type ButtonProps = Omit<AriaButtonProps, "className"> & {
  variant?: ButtonVariant;
};

const baseClassName =
  "inline-flex items-center justify-center px-5 font-sans font-bold " +
  // Excludes outline-color from the transition so the focus ring appears instantly, not mid-fade.
  "transition-[background-color,color,border-color] outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-brand-blue-strong " +
  "data-[disabled]:opacity-[0.45]";

const variantClassName: Record<ButtonVariant, string> = {
  primary:
    "h-[4.5rem] gap-3 rounded-lg bg-brand-blue-ui text-surface-white text-2xl data-[hovered]:bg-brand-blue-strong",
  secondary:
    "h-[2.5rem] gap-2 rounded-md border border-brand-earth-ui bg-transparent text-ink text-base data-[hovered]:bg-surface-bone",
};

export function Button({ variant = "primary", ...props }: ButtonProps) {
  return <AriaButton {...props} className={`${baseClassName} ${variantClassName[variant]}`} />;
}
