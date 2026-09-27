import { createRoute } from "@tanstack/react-router";
import { canSeePricesArea } from "../access/backoffice-access";
import { catalogAreaRoute } from "../shell/catalog-area";
import { useDocumentTitle } from "../shell/document-title";
import { refuseWithout } from "../shell/signed-in-route";
import { PricesListScreen } from "./prices-list-screen";

export const pricesListRoute = createRoute({
  getParentRoute: () => catalogAreaRoute,
  path: "prices",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeePricesArea),
  component: PricesListPage,
});

function PricesListPage() {
  const { services, sessionActions } = pricesListRoute.useRouteContext();
  useDocumentTitle("Precios · Puro Sur");
  return (
    <PricesListScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.pricesListScreen}
    />
  );
}
