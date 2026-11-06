import type { AlertsOverview } from "@purosur/contracts";
import { LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { type ReactNode, useId } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { CloudData } from "../platform/use-cloud-query";
import { AlertsLevelCards } from "./alerts-level-cards";
import { AlertsOpenCountPill } from "./alerts-open-count-pill";
import { openAlertsCount } from "./open-alerts-count";

export type AlertsOverviewProps = {
  data: CloudData<AlertsOverview>;
};

function OverviewSection({ children }: { children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-subheading text-text">
        Alertas abiertas
      </h2>
      {children}
    </section>
  );
}

export function AlertsOverviewOpenCount({ data }: AlertsOverviewProps) {
  return (
    <AlertsOpenCountPill openCount={data.status === "loaded" ? openAlertsCount(data.value) : 0} />
  );
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
      {data.status === "loaded" && <AlertsLevelCards overview={data.value} />}
    </OverviewSection>
  );
}
