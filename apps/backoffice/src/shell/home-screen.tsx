import { AlertsOverviewOpenCount, AlertsOverviewSection } from "../alerts/alerts-overview-section";
import { RegistersSyncSection } from "../register/registers-sync-section";
import type { BackofficeAccess } from "./backoffice-access";
import type { HomeScreenServices } from "./home-screen-services";
import { ScreenLayout } from "./screen-layout";
import { ScreenTitle } from "./screen-title";

export type HomeScreenProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: HomeScreenServices;
};

export function HomeScreen({ access, onSessionEnded, services }: HomeScreenProps) {
  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
          <div className="flex flex-col justify-center">
            <p className="text-text-subtle text-detail">Puro Sur</p>
            <ScreenTitle>Inicio</ScreenTitle>
          </div>
          <AlertsOverviewOpenCount
            access={access}
            onSessionEnded={onSessionEnded}
            services={services}
          />
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      <AlertsOverviewSection access={access} onSessionEnded={onSessionEnded} services={services} />
      <RegistersSyncSection onSessionEnded={onSessionEnded} services={services} />
    </ScreenLayout>
  );
}
