import type { MouseEvent } from "react";
import { navigate } from "./router";

export type LinkProps = {
  href: string;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
};

// A left click with no modifier is the only click this SPA takes over: any other combination is
// the browser's own "open in a new tab/window" gesture, which an intercepted click would break.
function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function linkProps(to: string): LinkProps {
  return {
    href: to,
    onClick: (event) => {
      if (event.defaultPrevented || !isPlainLeftClick(event)) {
        return;
      }
      event.preventDefault();
      navigate(to);
    },
  };
}
