import { createContext, type ReactNode, Suspense, useContext } from "react";
import { ScreenTitle } from "./screen-title";

export const StockTopBarAlertsCount = createContext<ReactNode>(null);

export function StockTopBar({ title, action }: { title: string; action?: ReactNode }) {
  const alertsCount = useContext(StockTopBarAlertsCount);
  return (
    <div className="flex h-18 shrink-0 items-center gap-4 border-border border-b bg-surface px-8">
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-text-subtle text-detail">Stock</p>
        <ScreenTitle>{title}</ScreenTitle>
      </div>
      <Suspense fallback={null}>{alertsCount}</Suspense>
      {action}
    </div>
  );
}
