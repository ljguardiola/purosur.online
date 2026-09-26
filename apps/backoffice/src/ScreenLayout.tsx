import type { ReactNode } from "react";

export type ScreenLayoutProps = {
  topBar: ReactNode;
  bodyClassName: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Shell's `<main>` itself never scrolls, so only this body region can. */
export function ScreenLayout({ topBar, bodyClassName, children, footer }: ScreenLayoutProps) {
  return (
    <>
      {topBar}
      {/* `relative` makes the body the containing block of react-aria's absolutely positioned
          visually hidden inputs; without it they're placed against the page, which then scrolls. */}
      <div className={`relative flex min-h-0 flex-1 flex-col overflow-auto ${bodyClassName}`}>
        {children}
      </div>
      {footer}
    </>
  );
}
