import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from "react";

// Small, right-aligned label such as the role editor's "Caja"/"PIN" permission markers: a filled
// pill carrying a short word and an optional leading icon, never the sole way to convey meaning
// (its caller always pairs it with adjacent text). Forwards its ref and spreads unknown props onto
// its own root so a caller can wrap it in react-aria's `Focusable` to make it a tooltip's trigger,
// without this component knowing anything about tooltips itself.
export type TagTone = "neutral" | "info";

export type TagProps = {
  tone: TagTone;
  icon?: ReactNode;
  children: Exclude<ReactNode, null | undefined | boolean>;
};

const tagClassName =
  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-bold whitespace-nowrap " +
  "outline-none focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-3 " +
  "focus-visible:outline-brand-blue-strong";

const toneClassName: Record<TagTone, string> = {
  neutral: "bg-surface-bone text-ink-secondary",
  info: "bg-brand-blue-message-bg text-brand-blue-strong",
};

// See Modal.tsx's headerIconWrapperClassName: each glyph's size is imposed by its own wrapper's
// CSS, never by cloning a `size` prop onto the caller's icon element.
const iconWrapperClassName = "inline-flex size-3 shrink-0 [&>svg]:h-full [&>svg]:w-full";

// The extra span attributes react-aria's `Focusable` merges onto this element when a caller wraps
// it as a tooltip's trigger (tabIndex, onFocus/onBlur, onMouseEnter/Leave, aria-describedby...).
type TagDomProps = Omit<ComponentPropsWithoutRef<"span">, keyof TagProps>;

export const Tag = forwardRef<HTMLSpanElement, TagProps & TagDomProps>(function Tag(
  { tone, icon, children, ...rest },
  ref,
) {
  return (
    <span ref={ref} className={[tagClassName, toneClassName[tone]].join(" ")} {...rest}>
      {icon && (
        <span aria-hidden="true" className={iconWrapperClassName}>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
});
