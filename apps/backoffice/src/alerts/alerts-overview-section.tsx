import type { AlertsOverview } from "@purosur/contracts";
import { EmptyState, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { Bell, BellOff } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { type BackofficeAccess, canSeeAlertsArea } from "../shell/backoffice-access";
import type { fetchAlertsOverview } from "./alerts-api";
import { AlertsLevelCards } from "./alerts-level-cards";
import { AlertsOpenCountPill } from "./alerts-open-count-pill";
import { useAlertsOverviewQuery } from "./alerts-queries";

export type AlertsOverviewSectionServices = {
  fetchAlertsOverview: typeof fetchAlertsOverview;
};

export type AlertsOverviewSectionProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: AlertsOverviewSectionServices;
};

type VisibleAlertsOverviewProps = Omit<AlertsOverviewSectionProps, "access">;

function openCount(overview: AlertsOverview): number {
  return (
    overview.critical.openCount + overview.warning.openCount + overview.informational.openCount
  );
}

function OverviewSection({ children }: { children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-subheading text-text">
        Alertas
      </h2>
      {children}
    </section>
  );
}

function VisibleAlertsOpenCount({ onSessionEnded, services }: VisibleAlertsOverviewProps) {
  const data = useAlertsOverviewQuery({
    fetchAlertsOverview: services.fetchAlertsOverview,
    onSessionEnded,
  });
  return <AlertsOpenCountPill openCount={data.status === "loaded" ? openCount(data.value) : 0} />;
}

export function AlertsOverviewOpenCount({
  access,
  onSessionEnded,
  services,
}: AlertsOverviewSectionProps) {
  if (!canSeeAlertsArea(access)) {
    return null;
  }
  return <VisibleAlertsOpenCount onSessionEnded={onSessionEnded} services={services} />;
}

function VisibleAlertsOverview({ onSessionEnded, services }: VisibleAlertsOverviewProps) {
  const data = useAlertsOverviewQuery({
    fetchAlertsOverview: services.fetchAlertsOverview,
    onSessionEnded,
  });
  return (
    <OverviewSection>
      {data.status === "loading" && (
        <div className="grid grid-cols-3 gap-4">
          <LoadingPlaceholder variant="card" lines={2} />
          <LoadingPlaceholder variant="card" lines={2} />
          <LoadingPlaceholder variant="card" lines={2} />
        </div>
      )}
      {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, "las alertas")} />}
      {data.status === "loaded" &&
        (openCount(data.value) === 0 ? (
          <EmptyState
            icon={<Bell />}
            title="Sin alertas abiertas"
            description="Cuando algo necesite atención, aparece acá."
            variant="blank"
          />
        ) : (
          <AlertsLevelCards overview={data.value} />
        ))}
    </OverviewSection>
  );
}

export function AlertsOverviewSection({
  access,
  onSessionEnded,
  services,
}: AlertsOverviewSectionProps) {
  if (!canSeeAlertsArea(access)) {
    return (
      <OverviewSection>
        <EmptyState
          icon={<BellOff />}
          title="No tenés alertas para ver"
          description="Tu rol no incluye permiso para ver alertas."
          variant="blank"
        />
      </OverviewSection>
    );
  }
  return <VisibleAlertsOverview onSessionEnded={onSessionEnded} services={services} />;
}
