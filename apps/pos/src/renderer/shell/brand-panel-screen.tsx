import type { KeyLegendItem } from "@purosur/ui";
import { formatDate, KeyLegend, PuroSurLogo } from "@purosur/ui";
import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
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

type BrandPanelFooterProps = {
  status?: string | undefined;
  version?: string | null | undefined;
};

function BrandPanelFooter({ status, version }: BrandPanelFooterProps) {
  return (
    <footer className="flex flex-col gap-1 text-detail text-text-subtle">
      {status === undefined ? null : <BrandPanelStatus status={status} />}
      {typeof version === "string" ? <p>{`Versión ${version}`}</p> : null}
    </footer>
  );
}

const LegendSlotContext = createContext<HTMLElement | null>(null);

export function BrandPanelLegend({ items }: { items: readonly KeyLegendItem[] }) {
  const slot = useContext(LegendSlotContext);

  return slot === null ? null : createPortal(<KeyLegend items={items} />, slot);
}

export function BrandPanelScreen({
  children,
  status,
  version,
}: BrandPanelFooterProps & { children?: ReactNode }) {
  const [legendSlot, setLegendSlot] = useState<HTMLElement | null>(null);

  return (
    <div className="flex h-full w-full bg-surface">
      <div className="flex w-2/5 min-w-80 flex-col bg-surface-soft p-8">
        <div className="flex flex-1 items-center justify-center">
          <PuroSurLogo className="h-41 w-105 object-contain" />
        </div>
        <div className="flex flex-col gap-1">
          <div ref={setLegendSlot} />
          {status === undefined && typeof version !== "string" ? null : (
            <BrandPanelFooter status={status} version={version} />
          )}
        </div>
      </div>
      <LegendSlotContext value={legendSlot}>
        <div className="flex flex-1 items-center justify-center p-8">{children}</div>
      </LegendSlotContext>
    </div>
  );
}
