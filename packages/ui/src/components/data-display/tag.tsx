import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { type TagTone, tagDotClassName, tagToneClassName } from "./tag-styles";

export type TagProps = {
  tone: TagTone;
  children: Exclude<ReactNode, null | undefined | boolean>;
  ref?: Ref<HTMLSpanElement>;
} & ({ variant?: "plain"; icon?: Icon } | { variant: "status"; icon?: undefined });

const tagClassName =
  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-caption font-bold whitespace-nowrap " +
  "outline-none focus-visible:focus-ring";

// The extra span attributes react-aria's `Focusable` merges onto this element when a caller wraps
// it as a tooltip's trigger (tabIndex, onFocus/onBlur, onMouseEnter/Leave, aria-describedby...).
type TagDomProps = Omit<ComponentPropsWithoutRef<"span">, keyof TagProps>;

export function Tag({
  tone,
  variant = "plain",
  icon,
  children,
  ref,
  ...rest
}: TagProps & TagDomProps) {
  return (
    <span ref={ref} className={[tagClassName, tagToneClassName[tone]].join(" ")} {...rest}>
      {variant === "status" ? <span aria-hidden="true" className={tagDotClassName[tone]} /> : null}
      {icon ? (
        <span aria-hidden="true" className={iconSlotClassName["2xs"]}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
