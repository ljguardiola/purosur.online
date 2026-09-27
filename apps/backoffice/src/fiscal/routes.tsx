import { createRoute } from "@tanstack/react-router";
import { canSeeCashArea } from "../access/backoffice-access";
import { cashAndFiscalAreaRoute } from "../shell/cash-and-fiscal-area";
import { useDocumentTitle } from "../shell/document-title";
import { refuseWithout } from "../shell/signed-in-route";
import { FiscalConfigurationScreen } from "./fiscal-configuration-screen";

export const fiscalConfigurationRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "fiscal-configuration",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeCashArea),
  component: FiscalConfigurationPage,
});

function FiscalConfigurationPage() {
  const { services, sessionActions } = fiscalConfigurationRoute.useRouteContext();
  useDocumentTitle("Configuración fiscal · Puro Sur");
  return (
    <FiscalConfigurationScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.fiscalConfigurationScreen}
    />
  );
}
