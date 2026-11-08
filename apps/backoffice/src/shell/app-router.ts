import { createRoute, createRouter, redirect } from "@tanstack/react-router";
import { alertsRedirectRoute, homeRoute } from "../alerts/routes";
import { branchSettingsRoute } from "../branch/routes";
import {
  brandsListRoute,
  categoriesListRoute,
  classificationRoute,
  legacyBrandsRoute,
  legacyCategoriesRoute,
  legacyTagsRoute,
  productsListRoute,
  tagsListRoute,
} from "../catalog/routes";
import {
  accountRecoveryRoute,
  legacyAccountRoute,
  registerPasskeyRoute,
} from "../credentials/routes";
import {
  caeaRoute,
  fiscalRoute,
  fiscalSettingsRoute,
  fiscalTasksRoute,
  issuedFiscalDocumentsReportRoute,
  issuedFiscalDocumentsRoute,
  legacyContingencyTicketRescueRoute,
  legacyExceptionalityRoute,
  legacyFiscalDocumentsRoute,
  legacyFiscalSettingsRoute,
  legacyFiscalTasksRoute,
  legacyPointsOfSaleRoute,
} from "../fiscal/routes";
import { helpArticleRoute, helpCategoryRoute, helpHomeRoute } from "../help/routes";
import {
  handConfirmedPaymentsRoute,
  legacyMercadoPagoRefundsRoute,
  legacyOutsideRefundsRoute,
  pendingRefundsRoute,
  salesByPaymentMethodRoute,
} from "../payments/routes";
import { legacyRolesRoute, rolesListRoute } from "../permissions/routes";
import {
  discountsListRoute,
  legacyDiscountsRoute,
  legacyPricesRoute,
  pricesListRoute,
  pricesPastReviewDeadlineReportRoute,
} from "../pricing/routes";
import {
  aiCostReportRoute,
  freightReportRoute,
  freightsListRoute,
  newPurchaseRoute,
  orderSuggestionRoute,
  pendingPurchaseOrdersReportRoute,
  purchaseOrderReceiveRoute,
  purchaseOrderRoute,
  purchaseOrdersRoute,
  purchasesListRoute,
  purchasesReportRoute,
  receiptDifferencesReportRoute,
  supplierPriceComparisonRoute,
  supplierPriceListReviewRoute,
  supplierPriceListsRoute,
  suppliersListRoute,
} from "../purchasing/routes";
import {
  cashMovementsRoute,
  cashSessionClosesRoute,
  legacyBackupsRoute,
  legacyCashMovementsRoute,
  legacyCashSessionClosesRoute,
  registersListRoute,
  registersRoute,
} from "../register/routes";
import { legacyReturnsReportRoute, returnsHistoryRoute } from "../returns/routes";
import {
  averageTicketRoute,
  cashRoundingRoute,
  handTypedWeightsRoute,
  manualDiscountsRoute,
  reportsIndexRoute,
  salesByCashierRoute,
  salesByDayRoute,
  salesByProductAndCategoryRoute,
  salesByPromotionRoute,
} from "../sales/routes";
import { legacyCompromiseResponseRoute, signInRoute } from "../sessions/routes";
import {
  assembliesRoute,
  assemblyBatchesRoute,
  currentStockReportRoute,
  expiringLotsReportRoute,
  expiringLotsRoute,
  legacyAssemblyBatchesRoute,
  legacyExpiringLotsRoute,
  legacyInitialInventoryRoute,
  legacyRecipesRoute,
  legacyStockBalancesRoute,
  legacyStockCountsRoute,
  legacyStockMovementsRoute,
  lossesByReasonReportRoute,
  marginReportRoute,
  recipesListRoute,
  stockBalancesRoute,
  stockMovementsRoute,
} from "../stock/routes";
import { quarantinedEventsRoute } from "../sync/routes";
import { legacyUserRoute, legacyUsersRoute, usersListRoute } from "../users/routes";
import { fiscalAreaRoute } from "./fiscal-area";
import { helpAreaRoute } from "./help-area";
import { homeAreaRoute } from "./home-area";
import { ScreenDownloadFailure } from "./lazy-screen";
import { ordersAreaRoute } from "./orders-area";
import { peopleLandingRoute, peopleRoute } from "./people-route";
import { productsAreaRoute } from "./products-area";
import { productsRoute } from "./products-route";
import { publicRoute } from "./public-route";
import { refundsRoute } from "./refunds-route";
import { reportsAreaRoute } from "./reports-area";
import { type RouterContext, rootRoute } from "./root-route";
import { salesAndCashAreaRoute } from "./sales-and-cash-area";
import { ScreenFailure } from "./screen-failure";
import { ScreenPending } from "./screen-pending";
import { focusScreenTitle } from "./screen-title";
import { parseSearch, stringifySearch } from "./search-params";
import { settingsAreaRoute } from "./settings-area";
import { signedInRoute } from "./signed-in-route";
import { stockAreaRoute } from "./stock-area";
import { stockRoute } from "./stock-route";

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
    homeAreaRoute.addChildren([homeRoute, alertsRedirectRoute]),
    productsAreaRoute.addChildren([
      productsRoute.addChildren([
        productsListRoute,
        pricesListRoute,
        discountsListRoute,
        assembliesRoute.addChildren([recipesListRoute, assemblyBatchesRoute]),
        classificationRoute.addChildren([categoriesListRoute, brandsListRoute, tagsListRoute]),
      ]),
    ]),
    stockAreaRoute.addChildren([
      stockRoute.addChildren([stockBalancesRoute, expiringLotsRoute, stockMovementsRoute]),
      suppliersListRoute,
      purchasesListRoute,
      newPurchaseRoute,
      freightsListRoute,
    ]),
    ordersAreaRoute.addChildren([
      supplierPriceListsRoute,
      supplierPriceListReviewRoute,
      supplierPriceComparisonRoute,
      orderSuggestionRoute,
      purchaseOrdersRoute,
      purchaseOrderRoute,
      purchaseOrderReceiveRoute,
    ]),
    salesAndCashAreaRoute.addChildren([
      registersRoute.addChildren([registersListRoute, cashSessionClosesRoute, cashMovementsRoute]),
      refundsRoute.addChildren([pendingRefundsRoute, returnsHistoryRoute]),
    ]),
    fiscalAreaRoute.addChildren([
      fiscalRoute.addChildren([
        fiscalTasksRoute,
        issuedFiscalDocumentsRoute,
        caeaRoute,
        fiscalSettingsRoute,
      ]),
    ]),
    reportsAreaRoute.addChildren([
      reportsIndexRoute,
      salesByDayRoute,
      salesByPaymentMethodRoute,
      handConfirmedPaymentsRoute,
      salesByProductAndCategoryRoute,
      salesByCashierRoute,
      handTypedWeightsRoute,
      averageTicketRoute,
      currentStockReportRoute,
      expiringLotsReportRoute,
      lossesByReasonReportRoute,
      marginReportRoute,
      pricesPastReviewDeadlineReportRoute,
      purchasesReportRoute,
      freightReportRoute,
      pendingPurchaseOrdersReportRoute,
      receiptDifferencesReportRoute,
      aiCostReportRoute,
      salesByPromotionRoute,
      manualDiscountsRoute,
      cashRoundingRoute,
      issuedFiscalDocumentsReportRoute,
    ]),
    settingsAreaRoute.addChildren([
      peopleRoute.addChildren([peopleLandingRoute, usersListRoute, rolesListRoute]),
      branchSettingsRoute,
      quarantinedEventsRoute,
    ]),
    legacyAccountRoute,
    legacyCategoriesRoute,
    legacyBrandsRoute,
    legacyTagsRoute,
    legacyPricesRoute,
    legacyDiscountsRoute,
    legacyRecipesRoute,
    legacyAssemblyBatchesRoute,
    legacyStockBalancesRoute,
    legacyExpiringLotsRoute,
    legacyStockCountsRoute,
    legacyStockMovementsRoute,
    legacyInitialInventoryRoute,
    legacyFiscalTasksRoute,
    legacyFiscalDocumentsRoute,
    legacyExceptionalityRoute,
    legacyPointsOfSaleRoute,
    legacyFiscalSettingsRoute,
    legacyContingencyTicketRescueRoute,
    legacyBackupsRoute,
    legacyCashSessionClosesRoute,
    legacyCashMovementsRoute,
    legacyMercadoPagoRefundsRoute,
    legacyOutsideRefundsRoute,
    legacyReturnsReportRoute,
    legacyUsersRoute,
    legacyUserRoute,
    legacyRolesRoute,
    legacyCompromiseResponseRoute,
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
