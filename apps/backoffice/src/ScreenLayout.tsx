import type { ReactNode } from "react";

export type ScreenLayoutProps = {
  topBar: ReactNode;
  /** The screen's own spacing for its body. */
  bodyClassName: string;
  children: ReactNode;
  /** An action bar pinned below the body, for screens that have one. */
  footer?: ReactNode;
};

/**
 * Every backoffice screen's own layout inside Shell: a fixed top bar, a body that is the only
 * scroll region, and an optional footer pinned below it. Shell's `<main>` itself never scrolls, so
 * a screen can't accidentally let its top bar (or footer) scroll away with the body.
 */
export function ScreenLayout({ topBar, bodyClassName, children, footer }: ScreenLayoutProps) {
  return (
    <>
      {topBar}
      {/* `relative` makes the body the containing block of React Aria's visually hidden checkbox,
          radio and switch inputs, which are absolutely positioned: without it they are placed
          against the page, stretching it past the viewport so the whole page scrolls. */}
      <div className={`relative flex min-h-0 flex-1 flex-col overflow-auto ${bodyClassName}`}>
        {children}
      </div>
      {footer}
    </>
  );
}
