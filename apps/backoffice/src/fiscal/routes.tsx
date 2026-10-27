import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { canSeeCashArea, canSeeFiscalInformation } from "../shell/backoffice-access";
import { cashAndFiscalAreaRoute } from "../shell/cash-and-fiscal-area";
import { lazyScreen } from "../shell/lazy-screen";
import { refuseWithout } from "../shell/signed-in-route";
import { issuedFiscalDocumentsFilters } from "./issued-fiscal-documents-filters";

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

export const fiscalTasksRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "fiscal-tasks",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeFiscalInformation),
  component: lazyScreen(() => import("./fiscal-tasks-page"), "FiscalTasksPage"),
});

export const issuedFiscalDocumentsRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "fiscal-documents",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeFiscalInformation),
  validateSearch: issuedFiscalDocumentsFilters,
  search: { middlewares: [stripSearchParams(issuedFiscalDocumentsFilters.parse({}))] },
  component: lazyScreen(
    () => import("./issued-fiscal-documents-page"),
    "IssuedFiscalDocumentsPage",
  ),
});
