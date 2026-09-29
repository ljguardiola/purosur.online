import type { AlertsOverview } from "@purosur/contracts";
import { EmptyState, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { Bell, BellOff } from "lucide-react";
import { type ReactNode, useId } from "react";
import { type BackofficeAccess, canSeeAlertsArea } from "../access/backoffice-access";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { AlertsLevelCards } from "./alerts-level-cards";
import { AlertsOpenCountPill } from "./alerts-open-count-pill";
import type { AlertsOverviewScreenServices } from "./alerts-overview-services";
import { useAlertsOverviewQuery } from "./alerts-queries";

export type AlertsOverviewScreenProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: AlertsOverviewScreenServices;
};

function openCount(overview: AlertsOverview): number {
  return (
    overview.critical.openCount + overview.warning.openCount + overview.informational.openCount
  );
}

function OverviewLayout({ openCount, children }: { openCount: number; children: ReactNode }) {
  const headingId = useId();
  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
          <div className="flex flex-col justify-center">
            <p className="text-text-subtle text-detail">Puro Sur</p>
            <ScreenTitle>Inicio</ScreenTitle>
          </div>
          <AlertsOpenCountPill openCount={openCount} />
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <h2 id={headingId} className="text-subheading text-text">
          Alertas
        </h2>
        {children}
      </section>
    </ScreenLayout>
  );
}

function VisibleAlertsOverview({
  onSessionEnded,
  services,
}: Omit<AlertsOverviewScreenProps, "access">) {
  const data = useAlertsOverviewQuery({
    fetchAlertsOverview: services.fetchAlertsOverview,
    onSessionEnded,
  });
  const total = data.status === "loaded" ? openCount(data.value) : 0;
  return (
    <OverviewLayout openCount={total}>
      {data.status === "loading" && (
        <div className="grid grid-cols-3 gap-4">
          <LoadingPlaceholder variant="card" lines={2} />
          <LoadingPlaceholder variant="card" lines={2} />
          <LoadingPlaceholder variant="card" lines={2} />
        </div>
      )}
      {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, "las alertas")} />}
      {data.status === "loaded" &&
        (total === 0 ? (
          <EmptyState
            icon={<Bell />}
            title="Sin alertas abiertas"
            description="Cuando algo necesite atención, aparece acá."
            variant="blank"
          />
        ) : (
          <AlertsLevelCards overview={data.value} />
        ))}
    </OverviewLayout>
  );
}

export function AlertsOverviewScreen({
  access,
  onSessionEnded,
  services,
}: AlertsOverviewScreenProps) {
  if (!canSeeAlertsArea(access)) {
    return (
      <OverviewLayout openCount={0}>
        <EmptyState
          icon={<BellOff />}
          title="No tenés alertas para ver"
          description="Tu rol no incluye permiso para ver alertas."
          variant="blank"
        />
      </OverviewLayout>
    );
  }
  return <VisibleAlertsOverview onSessionEnded={onSessionEnded} services={services} />;
}
