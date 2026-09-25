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
  // Takes the width its row has free: the whole row when it is alone in it, what a content-sized
  // button beside it leaves, or an equal share beside another button asked for the same — equal
  // once each has taken the room its own padding and border need, so a bordered one measures
  // those 2px wider. A row too narrow for its buttons takes width from every one of them, asked
  // for or not, down past the width the label needs to show whole — the label then shortens to an
  // ellipsis instead of wrapping onto a second line or spilling past the button. A row only as
  // wide as what it holds has nothing free to give, a container that is not a row leaves a button
  // the narrower of its own width and that container's — shortening the label the same way when
  // the container is the narrower of the two — and a vertical stack hands it the full width
  // already, so none of those is what this is for.
  fullWidth?: boolean;
};

// Each variant admits only the combinations the design draws for it, so asking for one it has no
// drawing for fails to compile instead of being silently ignored: the text variant exists in no
// other tone, at no other size, and always with the same "x", so it carries that icon itself
// rather than taking one from the caller.
export type ButtonProps = ButtonCommonProps &
  (
    | { variant?: "primary"; tone?: ButtonTone; size?: ButtonSize; icon?: ButtonIcon }
    | { variant: "secondary"; tone?: ButtonTone; size?: ButtonSize; icon?: ButtonIcon }
    | { variant: "text"; tone: "destructive"; size?: ButtonTextSize; icon?: undefined }
  );

// A stretched button asks for no width beyond what its own padding and border need, and grows
// into what the row has left over. Asking for the whole row instead and letting the row take the
// excess back is what the earlier version did, and the row took part of that back out of the
// button beside it, squeezing its label onto a second line.
//
// min-w-0 on both forms overrides a flex item's default min-width of auto, which otherwise
// refuses to shrink a button below its label's own content width — with it still in place, a row
// too narrow for its buttons would grow the button past the row instead of letting the label
// inside it truncate. max-w-full is needed by both forms: a button sizes to its label whatever
// its container's width, and grow holds it back only inside a row, so outside one a stretched
// button spills past a container too narrow for its label exactly as a content-sized one does.
// This caps either form at that container's width instead.
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

// A stretched button takes its size from how far it grows rather than from its height, and it
// grows along whichever direction its container runs: in a vertical stack it would come out as
// tall as the stack, or as short as the line of text inside it. A floor and a ceiling hold it at
// its height instead. Only a stretched button needs them, so an unstretched one is left with the
// height above and the ordinary freedom to be squeezed by a container too small for it.
const stretchedHeightClassName: Record<ButtonSize, string> = {
  small: "min-h-[2.5rem] max-h-[2.5rem]",
  medium: "min-h-[3rem] max-h-[3rem]",
  large: "min-h-[3.5rem] max-h-[3.5rem]",
  sale: "min-h-[4.5rem] max-h-[4.5rem]",
};

// The medium the other variants default to is never drawn for the text variant, so it defaults
// to the smaller of its own two sizes, the one the design uses everywhere but a modal footer.
const defaultSize: { primary: ButtonSize; secondary: ButtonSize; text: ButtonTextSize } = {
  primary: "medium",
  secondary: "medium",
  text: "small",
};

// The primary variant fills its whole background with its tone, so its hover state darkens that
// fill (bg-brand-blue-strong / bg-status-error-strong). The secondary variant paints no
// background of its own at rest, so its tone instead colors its border and text, the same way the
// text variant's destructive tone colors its label and icon; both keep the same bone hover
// background as the secondary's default tone (see variantClassName below) rather than switching
// to a tone-darkened fill, since there is no fill of their own to darken.
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

  // The text variant's "x" is part of the form, not a choice: it is hidden from assistive
  // technology so the button's accessible name stays the label alone.
  const glyph = variant === "text" ? <X aria-hidden="true" /> : icon;
  const sizedIcon = glyph ? <span className={iconWrapperClassName[variant]}>{glyph}</span> : null;

  return (
    <AriaButton {...props} className={className}>
      {variant !== "primary" && sizedIcon}
      {/* The button is a flex container centering its content (justify-center), so putting
          truncate directly on it clips both ends of an overflowing label with no ellipsis glyph
          at all, instead of shortening just the trailing edge — the label needs its own box to
          truncate. */}
      <span className="truncate">{children}</span>
      {variant === "primary" && sizedIcon}
    </AriaButton>
  );
}
