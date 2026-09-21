import type { AnchorHTMLAttributes, ReactNode } from "react";
import { linkProps } from "./linkProps";

export type RouteLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children: ReactNode;
};

/** An anchor that keeps every native link affordance while navigating in place through the router. */
export function RouteLink({ to, onClick, children, ...props }: RouteLinkProps) {
  const nav = linkProps(to);
  return (
    <a
      {...props}
      href={nav.href}
      onClick={(event) => {
        onClick?.(event);
        nav.onClick(event);
      }}
    >
      {children}
    </a>
  );
}
