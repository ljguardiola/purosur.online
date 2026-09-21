import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { navigate } from "./router";

export type RouteLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children: ReactNode;
};

// A left click with no modifier is the only click this SPA takes over: any other combination is
// the browser's own "open in a new tab/window" gesture, which needs the real navigation an
// intercepted click would prevent.
function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** An anchor that keeps every native link affordance while navigating in place through the router. */
export function RouteLink({ to, onClick, children, ...props }: RouteLinkProps) {
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !isPlainLeftClick(event)) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
