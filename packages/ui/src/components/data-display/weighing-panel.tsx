import { Scale } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";
import { Button } from "../forms/button";
import type { ScaleStatusBadgeProps } from "./scale-status-badge";
import { ScaleStatusBadge } from "./scale-status-badge";

export type WeighingPanelProps = {
  title: string;
  detail?: string | undefined;
  status: ScaleStatusBadgeProps["status"];
  onCancel: () => void;
  children: ReactNode;
  waiting?: ReactNode;
};

export function WeighingPanel({
  title,
  detail,
  status,
  onCancel,
  children,
  waiting,
}: WeighingPanelProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden rounded-lg border border-warning-soft bg-warning-subtle"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-warning-strong *:size-icon-lg"
          >
            <Scale />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id={titleId} className="text-title text-text">
              {title}
            </h2>
            {detail === undefined ? null : (
              <p className="text-detail text-warning-strong">{detail}</p>
            )}
          </div>
          <ScaleStatusBadge status={status}>
            {status === "stable" ? "Estable" : "Moviéndose"}
          </ScaleStatusBadge>
          <Button variant="text" keycap="Escape" onPress={onCancel}>
            Cancelar
          </Button>
        </div>
        {children}
      </div>
      {waiting === undefined ? null : (
        <div className="border-t border-dashed border-warning-soft bg-surface">{waiting}</div>
      )}
    </section>
  );
}
