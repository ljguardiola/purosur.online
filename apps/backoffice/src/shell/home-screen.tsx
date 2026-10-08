import type { AlertsOverview } from "@purosur/contracts";
import {
  AlertsNotPermittedSection,
  AlertsOverviewOpenCount,
  AlertsOverviewSection,
} from "../alerts/alerts-overview-section";
import { useAlertsOverviewQuery } from "../alerts/alerts-queries";
import type { CloudData } from "../platform/use-cloud-query";
import { useRegisterSyncStatusQuery } from "../register/register-queries";
import type { RegisterSyncStatus } from "../register/registers-api";
import { RegistersSyncSection } from "../register/registers-sync-section";
import { type BackofficeAccess, canSeeAlertsArea } from "./backoffice-access";
import type { HomeScreenServices } from "./home-screen-services";
import { ScreenLayout } from "./screen-layout";
import { ScreenTitle } from "./screen-title";

export type HomeScreenProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: HomeScreenServices;
};

type HomeContentProps = {
  alerts: CloudData<AlertsOverview> | "not_permitted";
  registers: CloudData<RegisterSyncStatus[]>;
};

function HomeContent({ alerts, registers }: HomeContentProps) {
  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
          <div className="flex flex-col justify-center">
            <p className="text-text-subtle text-detail">Puro Sur</p>
            <ScreenTitle>Inicio</ScreenTitle>
          </div>
          {alerts === "not_permitted" ? null : <AlertsOverviewOpenCount data={alerts} />}
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      {alerts === "not_permitted" ? (
        <AlertsNotPermittedSection />
      ) : (
        <AlertsOverviewSection data={alerts} />
      )}
      <RegistersSyncSection data={registers} />
    </ScreenLayout>
  );
}

function HomeContentWithAlerts({
  onSessionEnded,
  registers,
  services,
}: Omit<HomeScreenProps, "access"> & Pick<HomeContentProps, "registers">) {
  const alerts = useAlertsOverviewQuery({
    fetchAlertsOverview: services.fetchAlertsOverview,
    onSessionEnded,
  });
  return <HomeContent alerts={alerts} registers={registers} />;
}

export function HomeScreen({ access, onSessionEnded, services }: HomeScreenProps) {
  const registers = useRegisterSyncStatusQuery({
    fetchRegisterSyncStatus: services.fetchRegisterSyncStatus,
    onSessionEnded,
  });
  return canSeeAlertsArea(access) ? (
    <HomeContentWithAlerts
      onSessionEnded={onSessionEnded}
      registers={registers}
      services={services}
    />
  ) : (
    <HomeContent alerts="not_permitted" registers={registers} />
  );
}
