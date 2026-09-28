import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { canSeeCashArea } from "../access/backoffice-access";
import { cashAndFiscalAreaRoute } from "../shell/cash-and-fiscal-area";
import { refuseWithout } from "../shell/signed-in-route";

export const fiscalConfigurationRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "fiscal-configuration",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeCashArea),
  component: lazyRouteComponent(
    () => import("./fiscal-configuration-page"),
    "FiscalConfigurationPage",
  ),
});
