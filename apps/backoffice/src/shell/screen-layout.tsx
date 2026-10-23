import { type ReactNode, Suspense, useContext } from "react";
import { AreaTopBarUnbilledDeferredSales } from "./area-top-bar-unbilled-deferred-sales";

export type ScreenLayoutProps = {
  topBar: ReactNode;
  bodyClassName: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function ScreenLayout({ topBar, bodyClassName, children, footer }: ScreenLayoutProps) {
  const unbilledDeferredSales = useContext(AreaTopBarUnbilledDeferredSales);
  return (
    <>
      {unbilledDeferredSales === null ? (
        topBar
      ) : (
        <div className="flex shrink-0">
          <div className="min-w-0 flex-1">{topBar}</div>
          <Suspense fallback={null}>{unbilledDeferredSales}</Suspense>
        </div>
      )}
      {/* `relative` makes the body the containing block of react-aria's absolutely positioned
          visually hidden inputs; without it they're placed against the page, which then scrolls. */}
      <div className={`relative flex min-h-0 flex-1 flex-col overflow-auto ${bodyClassName}`}>
        {children}
      </div>
      {footer}
    </>
  );
}
