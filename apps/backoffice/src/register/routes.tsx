import { createRoute } from "@tanstack/react-router";
import { canSeeRegistersArea } from "../access/backoffice-access";
import { useDocumentTitle } from "../shell/document-title";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";
import { RegistersListScreen } from "./registers-list-screen";

export const registersListRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "registers",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRegistersArea),
  component: RegistersListPage,
});

function RegistersListPage() {
  const { services, sessionActions } = registersListRoute.useRouteContext();
  useDocumentTitle("Cajas registradoras · Puro Sur");
  return (
    <RegistersListScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.registersListScreen}
    />
  );
}
