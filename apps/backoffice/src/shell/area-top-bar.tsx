import { type ReactNode, Suspense, useContext } from "react";
import { AreaTopBarAlertsCount } from "./area-top-bar-alerts-count";
import { ScreenTitle } from "./screen-title";

export function AreaTopBar({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  const alertsCount = useContext(AreaTopBarAlertsCount);
  return (
    <div className="flex h-18 shrink-0 items-center gap-4 border-border border-b bg-surface px-8">
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-text-subtle text-detail">{eyebrow}</p>
        <ScreenTitle>{title}</ScreenTitle>
      </div>
      <Suspense fallback={null}>{alertsCount}</Suspense>
      {action}
    </div>
  );
}
