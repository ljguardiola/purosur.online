import { formatDate, PuroSurLogo } from "@purosur/ui";
import type { ReactNode } from "react";
import { useCurrentTime } from "../platform/use-current-time";

function BrandPanelStatus({ status }: { status: string }) {
  const now = useCurrentTime();

  return (
    <div className="flex items-center justify-between gap-4 font-bold">
      <p>{status}</p>
      {now === undefined ? null : (
        <time dateTime={now.toISOString()}>
          {formatDate(now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
        </time>
      )}
    </div>
  );
}

function BrandPanelFooter({ status, version }: { status?: string; version?: string | null }) {
  return (
    <footer className="flex flex-col gap-1 text-detail text-text-subtle">
      {status === undefined ? null : <BrandPanelStatus status={status} />}
      {typeof version === "string" ? <p>{`Versión ${version}`}</p> : null}
    </footer>
  );
}

export function BrandPanelScreen({
  children,
  status,
  version,
}: {
  children?: ReactNode;
  status?: string;
  version?: string | null;
}) {
  return (
    <div className="flex h-full w-full bg-surface">
      <div className="flex w-2/5 min-w-80 flex-col bg-surface-soft p-8">
        <div className="flex flex-1 items-center justify-center">
          <PuroSurLogo className="h-41 w-105 object-contain" />
        </div>
        {status === undefined && typeof version !== "string" ? null : (
          <BrandPanelFooter status={status} version={version} />
        )}
      </div>
      <div className="flex flex-1 items-center justify-center p-8">{children}</div>
    </div>
  );
}
