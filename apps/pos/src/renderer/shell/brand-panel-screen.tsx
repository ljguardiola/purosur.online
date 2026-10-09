import { formatDate, PuroSurLogo } from "@purosur/ui";
import type { ReactNode } from "react";
import { useCurrentTime } from "../platform/use-current-time";

function BrandPanelFooter({ status }: { status: string }) {
  const now = useCurrentTime();

  return (
    <footer className="flex items-center justify-between gap-4 text-detail font-bold text-text-subtle">
      <p>{status}</p>
      {now === undefined ? null : (
        <time dateTime={now.toISOString()}>
          {formatDate(now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
        </time>
      )}
    </footer>
  );
}

export function BrandPanelScreen({ children, status }: { children?: ReactNode; status?: string }) {
  return (
    <div className="flex h-full w-full bg-surface">
      <div className="flex w-2/5 min-w-80 flex-col bg-surface-soft p-8">
        <div className="flex flex-1 items-center justify-center">
          <PuroSurLogo className="h-41 w-105 object-contain" />
        </div>
        {status === undefined ? null : <BrandPanelFooter status={status} />}
      </div>
      <div className="flex flex-1 items-center justify-center p-8">{children}</div>
    </div>
  );
}
