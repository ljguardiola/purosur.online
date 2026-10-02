import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { Icon } from "../shared/icon";
import { type ButtonTextSize, textButtonLinkLook } from "./button";

export type ButtonLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "className" | "children"
> & {
  variant: "text";
  size?: ButtonTextSize;
  icon?: Icon;
  children: Exclude<ReactNode, null | undefined | boolean>;
};

const look = { text: textButtonLinkLook };

export function ButtonLink({ variant, size, icon, children, ...props }: ButtonLinkProps) {
  const { className, defaultSize, iconSlotClassName } = look[variant];
  return (
    <a {...props} className={className(size ?? defaultSize)}>
      {icon ? (
        <span aria-hidden="true" className={iconSlotClassName}>
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </a>
  );
}
