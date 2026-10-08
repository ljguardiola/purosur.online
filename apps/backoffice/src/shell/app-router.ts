import { createRoute, createRouter, redirect } from "@tanstack/react-router";
import {
  accountRecoveryRoute,
  myAccountRoute,
  registerPasskeyRoute,
  signInRoute,
  userDetailRoute,
  usersListRoute,
} from "../access/routes";
import { alertsListRoute, alertsOverviewRoute } from "../alerts/routes";
import { branchSettingsRoute } from "../branch/routes";
import {
  brandsListRoute,
  categoriesListRoute,
  productsListRoute,
  tagsListRoute,
} from "../catalog/routes";
import { fiscalConfigurationRoute, pointsOfSaleRoute } from "../fiscal/routes";
import { helpArticleRoute, helpCategoryRoute, helpHomeRoute } from "../help/routes";
import { rolesListRoute } from "../permissions/routes";
import { discountsListRoute, pricesListRoute } from "../pricing/routes";
import { registersListRoute } from "../register/routes";
import { pendingRefundsRoute, reportsIndexRoute, salesByDayRoute } from "../sales/routes";
import { stockBalancesRoute, stockCountsRoute, stockMovementsRoute } from "../stock/routes";
import { cashAndFiscalAreaRoute } from "./cash-and-fiscal-area";
import { catalogAreaRoute } from "./catalog-area";
import { helpAreaRoute } from "./help-area";
import { homeAreaRoute } from "./home-area";
import { ScreenDownloadFailure } from "./lazy-screen";
import { publicRoute } from "./public-route";
import { reportsAreaRoute } from "./reports-area";
import { type RouterContext, rootRoute } from "./root-route";
import { ScreenFailure } from "./screen-failure";
import { ScreenPending } from "./screen-pending";
import { focusScreenTitle } from "./screen-title";
import { parseSearch, stringifySearch } from "./search-params";
import { settingsAreaRoute } from "./settings-area";
import { signedInRoute } from "./signed-in-route";
import { stockAreaRoute } from "./stock-area";

const unknownPathRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  beforeLoad: () => {
    throw redirect({ to: "/help" });
  },
});

const routeTree = rootRoute.addChildren([
  unknownPathRoute,
  publicRoute.addChildren([signInRoute, accountRecoveryRoute, registerPasskeyRoute]),
  signedInRoute.addChildren([
    homeAreaRoute.addChildren([alertsOverviewRoute, alertsListRoute]),
    catalogAreaRoute.addChildren([
      productsListRoute,
      categoriesListRoute,
      brandsListRoute,
      tagsListRoute,
      pricesListRoute,
      discountsListRoute,
    ]),
    stockAreaRoute.addChildren([stockBalancesRoute, stockCountsRoute, stockMovementsRoute]),
    cashAndFiscalAreaRoute.addChildren([
      pointsOfSaleRoute,
      fiscalConfigurationRoute,
      pendingRefundsRoute,
    ]),
    reportsAreaRoute.addChildren([reportsIndexRoute, salesByDayRoute]),
    settingsAreaRoute.addChildren([
      myAccountRoute,
      usersListRoute,
      userDetailRoute,
      rolesListRoute,
      registersListRoute,
      branchSettingsRoute,
    ]),
    helpAreaRoute.addChildren([helpHomeRoute, helpCategoryRoute, helpArticleRoute]),
  ]),
]);

export function createAppRouter(context: RouterContext) {
  const router = createRouter({
    routeTree,
    context,
    parseSearch,
    stringifySearch,
    defaultPreload: "intent",
    defaultPendingComponent: ScreenPending,
    defaultErrorComponent: ScreenFailure,
    defaultOnCatch: (error) => {
      if (!(error instanceof ScreenDownloadFailure)) {
        context.reportError(error);
      }
    },
  });
  router.subscribe("onRendered", ({ pathChanged }) => {
    if (pathChanged) {
      focusScreenTitle();
    }
  });
  // The router only ever compares its own re-serialized query, so without this the address bar
  // would keep a query typed in another key order or encoding.
  const { history, latestLocation } = router;
  if (history.location.search !== latestLocation.searchStr) {
    history.replace(latestLocation.href, history.location.state);
  }
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
