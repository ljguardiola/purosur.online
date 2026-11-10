import type { AlertsOverview } from "@purosur/contracts";
import { AlertsListSection } from "../alerts/alerts-list-section";
import { AlertsOverviewOpenCount, AlertsOverviewSection } from "../alerts/alerts-overview-section";
import { useAlertsOverviewQuery } from "../alerts/alerts-queries";
import type { AlertsListFilters } from "../alerts/routes";
import { useRegisterSyncStatusQuery } from "../installation/installation-queries";
import { RegistersSyncSection } from "../installation/registers-sync-section";
import type { CloudData } from "../platform/use-cloud-query";
import { type BackofficeAccess, canSeeAlertsArea } from "./backoffice-access";
import type { HomeScreenServices } from "./home-screen-services";
import { PendingTasksSection } from "./pending-tasks-section";
import { ScreenLayout } from "./screen-layout";
import { ScreenTitle } from "./screen-title";

export type HomeScreenProps = {
  access: BackofficeAccess;
  filters: AlertsListFilters;
  onFiltersChange: (filters: AlertsListFilters) => void;
  onSessionEnded: () => void;
  services: HomeScreenServices;
};

function HomeContent({
  access,
  alerts,
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: HomeScreenProps & { alerts: CloudData<AlertsOverview> | "not_permitted" }) {
  const registers = useRegisterSyncStatusQuery({
    fetchRegisterSyncStatus: services.fetchRegisterSyncStatus,
    onSessionEnded,
  });
  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
          <div className="flex flex-col justify-center">
            <ScreenTitle>Inicio</ScreenTitle>
          </div>
          {alerts === "not_permitted" ? null : <AlertsOverviewOpenCount data={alerts} />}
        </div>
      }
      bodyClassName="gap-6 p-6"
    >
      {alerts === "not_permitted" ? null : (
        <>
          <AlertsOverviewSection data={alerts} />
          <AlertsListSection
            filters={filters}
            onFiltersChange={onFiltersChange}
            access={access}
            onSessionEnded={onSessionEnded}
            services={services}
          />
        </>
      )}
      <RegistersSyncSection data={registers} />
      <PendingTasksSection access={access} onSessionEnded={onSessionEnded} services={services} />
    </ScreenLayout>
  );
}

function HomeContentWithAlerts(props: HomeScreenProps) {
  const alerts = useAlertsOverviewQuery({
    fetchAlertsOverview: props.services.fetchAlertsOverview,
    onSessionEnded: props.onSessionEnded,
  });
  return <HomeContent {...props} alerts={alerts} />;
}

export function HomeScreen(props: HomeScreenProps) {
  return canSeeAlertsArea(props.access) ? (
    <HomeContentWithAlerts {...props} />
  ) : (
    <HomeContent {...props} alerts="not_permitted" />
  );
}
