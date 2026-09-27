import { createRoute, createRouter, redirect } from "@tanstack/react-router";
import {
  accountRecoveryRoute,
  myAccountRoute,
  registerPasskeyRoute,
  rolesListRoute,
  signInRoute,
  userDetailRoute,
  usersListRoute,
} from "../access/routes";
import { alertsListRoute } from "../alerts/routes";
import { branchSettingsRoute } from "../branch/routes";
import { categoriesListRoute, productsListRoute } from "../catalog/routes";
import { fiscalConfigurationRoute } from "../fiscal/routes";
import { helpArticleRoute, helpCategoryRoute, helpHomeRoute } from "../help/routes";
import { pricesListRoute } from "../pricing/routes";
import { registersListRoute } from "../register/routes";
import { cashAndFiscalAreaIndexRoute, cashAndFiscalAreaRoute } from "./cash-and-fiscal-area";
import { catalogAreaIndexRoute, catalogAreaRoute } from "./catalog-area";
import { helpAreaRoute } from "./help-area";
import { homeAreaIndexRoute, homeAreaRoute } from "./home-area";
import { publicRoute } from "./public-route";
import { type RouterContext, rootRoute } from "./root-route";
import { parseSearch, stringifySearch } from "./search-params";
import { settingsAreaIndexRoute, settingsAreaRoute } from "./settings-area";
import { signedInRoute } from "./signed-in-route";

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/help" });
  },
});

const unknownPathRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  beforeLoad: () => {
    throw redirect({ to: "/help" });
  },
});

const routeTree = rootRoute.addChildren([
  landingRoute,
  unknownPathRoute,
  publicRoute.addChildren([signInRoute, accountRecoveryRoute, registerPasskeyRoute]),
  signedInRoute.addChildren([
    homeAreaRoute.addChildren([homeAreaIndexRoute, alertsListRoute]),
    catalogAreaRoute.addChildren([
      catalogAreaIndexRoute,
      productsListRoute,
      categoriesListRoute,
      pricesListRoute,
    ]),
    cashAndFiscalAreaRoute.addChildren([cashAndFiscalAreaIndexRoute, fiscalConfigurationRoute]),
    settingsAreaRoute.addChildren([
      settingsAreaIndexRoute,
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
  return createRouter({ routeTree, context, parseSearch, stringifySearch });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
