import type { MouseEvent } from "react";
import { navigate } from "./router";

export type LinkProps = {
  href: string;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
};

// A left click with no modifier is the only click this SPA takes over: any other combination is
// the browser's own "open in a new tab/window" gesture, which needs the real navigation an
// intercepted click would prevent.
function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * The `href`/`onClick` pair any anchor-rendering component spreads onto its own `<a>` to
 * navigate through this app's router in place, while still following every native link
 * affordance (open in a new tab, copy link, etc.) it can't intercept.
 */
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
