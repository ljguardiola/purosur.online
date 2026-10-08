import type { AlertsOverview } from "@purosur/contracts";
import { EmptyState, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { Bell, BellOff } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { CloudData } from "../platform/use-cloud-query";
import { AlertsLevelCards } from "./alerts-level-cards";
import { AlertsOpenCountPill } from "./alerts-open-count-pill";

export type AlertsOverviewProps = {
  data: CloudData<AlertsOverview>;
};

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

export function AlertsOverviewOpenCount({ data }: AlertsOverviewProps) {
  return <AlertsOpenCountPill openCount={data.status === "loaded" ? openCount(data.value) : 0} />;
}

export function AlertsOverviewSection({ data }: AlertsOverviewProps) {
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

export function AlertsNotPermittedSection() {
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
