import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

export type TagTone = "neutral" | "info";

export type TagProps = {
  tone: TagTone;
  icon?: ReactNode;
  children: Exclude<ReactNode, null | undefined | boolean>;
  ref?: Ref<HTMLSpanElement>;
};

const tagClassName =
  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-bold whitespace-nowrap " +
  "outline-none focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-3 " +
  "focus-visible:outline-brand-blue-strong";

const toneClassName: Record<TagTone, string> = {
  neutral: "bg-surface-bone text-ink-secondary",
  info: "bg-brand-blue-message-bg text-brand-blue-strong",
};

// The icon's size is fixed by this span's CSS, not by cloning a `size` prop — only lucide icons
// interpret one.
const iconWrapperClassName = "inline-flex size-3 shrink-0 [&>svg]:h-full [&>svg]:w-full";

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
