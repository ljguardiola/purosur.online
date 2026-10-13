import type { AnchorHTMLAttributes } from "react";
import {
  PillContent,
  type PillContentProps,
  pillClassName,
  pillHoverRingClassName,
} from "./pill-look";

export type PillLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "className" | "children"
> &
  PillContentProps;

export function PillLink({ tone, icon, children, ...props }: PillLinkProps) {
  return (
    <a
      {...props}
      className={`${pillClassName(tone)} ${pillHoverRingClassName[tone]} outline-none focus-visible:focus-ring-tight`}
    >
      <PillContent icon={icon}>{children}</PillContent>
    </a>
  );
}
