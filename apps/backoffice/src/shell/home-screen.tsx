import { AlertsOverviewScreen } from "../alerts/alerts-overview-screen";
import type { AlertsOverviewScreenServices } from "../alerts/alerts-overview-services";
import { RegistersSyncSection } from "../register/registers-sync-section";
import type { RegistersSyncSectionServices } from "../register/registers-sync-services";
import type { BackofficeAccess } from "./backoffice-access";

export type HomeScreenProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: {
    alertsOverviewScreen: AlertsOverviewScreenServices;
    registersSyncSection: RegistersSyncSectionServices;
  };
};

export function HomeScreen({ access, onSessionEnded, services }: HomeScreenProps) {
  return (
    <AlertsOverviewScreen
      access={access}
      onSessionEnded={onSessionEnded}
      services={services.alertsOverviewScreen}
    >
      <RegistersSyncSection
        onSessionEnded={onSessionEnded}
        services={services.registersSyncSection}
      />
    </AlertsOverviewScreen>
  );
}
