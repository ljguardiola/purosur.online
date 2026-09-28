import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

export type TagTone = "neutral" | "info";

export type TagProps = {
  tone: TagTone;
  icon?: ReactNode;
  children: Exclude<ReactNode, null | undefined | boolean>;
  ref?: Ref<HTMLSpanElement>;
};

const tagClassName =
  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-caption font-bold whitespace-nowrap " +
  "outline-none focus-visible:focus-ring";

const toneClassName: Record<TagTone, string> = {
  neutral: "bg-surface-subtle text-text-subtle",
  info: "bg-info-subtle text-info-strong",
};

// The icon's size is fixed by this span's CSS, not by cloning a `size` prop — only lucide icons
// interpret one.
const iconWrapperClassName = "inline-flex size-icon-2xs shrink-0 *:size-full";

// The extra span attributes react-aria's `Focusable` merges onto this element when a caller wraps
// it as a tooltip's trigger (tabIndex, onFocus/onBlur, onMouseEnter/Leave, aria-describedby...).
type TagDomProps = Omit<ComponentPropsWithoutRef<"span">, keyof TagProps>;

export function Tag({ tone, icon, children, ref, ...rest }: TagProps & TagDomProps) {
  return (
    <span ref={ref} className={[tagClassName, toneClassName[tone]].join(" ")} {...rest}>
      {icon ? (
        <span aria-hidden="true" className={iconWrapperClassName}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
