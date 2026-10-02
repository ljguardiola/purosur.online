import { createRoute } from "@tanstack/react-router";
import { canSeeCashArea } from "../shell/backoffice-access";
import { cashAndFiscalAreaRoute } from "../shell/cash-and-fiscal-area";
import { lazyScreen } from "../shell/lazy-screen";
import { refuseWithout } from "../shell/signed-in-route";

export const fiscalConfigurationRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "fiscal-settings",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeCashArea),
  component: lazyScreen(() => import("./fiscal-configuration-page"), "FiscalConfigurationPage"),
});

export const pointsOfSaleRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "points-of-sale",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeCashArea),
  component: lazyScreen(() => import("./points-of-sale-page"), "PointsOfSalePage"),
});
