import { createRoute } from "@tanstack/react-router";
import { canSeeBranchArea } from "../access/backoffice-access";
import { useDocumentTitle } from "../shell/document-title";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";
import { BranchSettingsScreen } from "./branch-settings-screen";

export const branchSettingsRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "branch",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeBranchArea),
  component: BranchSettingsPage,
});

function BranchSettingsPage() {
  const { services, sessionActions } = branchSettingsRoute.useRouteContext();
  useDocumentTitle("Sucursal · Puro Sur");
  return (
    <BranchSettingsScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.branchSettingsScreen}
    />
  );
}
