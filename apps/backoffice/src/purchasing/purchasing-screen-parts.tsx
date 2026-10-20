import { type ReactNode, Suspense, useContext } from "react";
import { ScreenTitle } from "../shell/screen-title";
import { StockTopBarAlertsCount } from "../shell/stock-top-bar-alerts-count";

export function PurchasingTopBar({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}) {
  const alertsCount = useContext(StockTopBarAlertsCount);
  return (
    <div className="flex h-18 shrink-0 items-center gap-4 border-border border-b bg-surface px-8">
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-text-subtle text-detail">{eyebrow}</p>
        <ScreenTitle>{title}</ScreenTitle>
      </div>
      <Suspense fallback={null}>{alertsCount}</Suspense>
      {actions}
    </div>
  );
}
