import { freightPeriodSchema } from "@purosur/contracts";
import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import {
  canComparePrices,
  canManageFreights,
  canManageSupplierPriceLists,
  canReadPurchaseOrders,
  canReceivePurchaseOrders,
  canRecordPurchases,
  canSeeAiCostReport,
  canSeeReports,
  canSeeSuppliersPage,
} from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { purchasingAreaRoute } from "../shell/purchasing-area";
import { reportPeriodSearch } from "../shell/report-filters-search";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout, signedInRoute } from "../shell/signed-in-route";
import { aiCostReportFilters } from "./ai-cost-report-filters";
import { orderSuggestionFilters } from "./order-suggestion-filters";
import { purchaseOrdersFilters } from "./purchase-orders-filters";
import { SUPPLIER_PANEL_TAB_KEYS } from "./supplier-panel-tabs";
import { supplierPriceComparisonFilters } from "./supplier-price-comparison-filters";
import {
  supplierPriceListReviewFilters,
  supplierPriceListsFilters,
} from "./supplier-price-lists-filters";
import { SUPPLIERS_TAB_TARGETS, SUPPLIERS_TABS, type SuppliersTab } from "./suppliers-tabs";

export const suppliersListFilters = z.object({
  search: z.string().default("").catch(""),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type SuppliersListFilters = z.output<typeof suppliersListFilters>;

const suppliersListSearch = suppliersListFilters.extend({
  supplier: z.string().optional().catch(undefined),
  tab: z.enum(SUPPLIER_PANEL_TAB_KEYS).optional().catch(undefined),
});

export const suppliersRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "suppliers",
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeeSuppliersPage);
    return {
      suppliersTabs: SUPPLIERS_TABS.filter((tab) => tab.isVisibleTo(session)).map((tab) => tab.key),
    };
  },
  component: lazyScreen(() => import("./suppliers-page"), "SuppliersPage"),
});

function suppliersTabRedirect(suppliersTabs: readonly SuppliersTab[], own: SuppliersTab): void {
  const [first] = suppliersTabs;
  if (first === undefined || suppliersTabs.includes(own)) {
    return;
  }
  throw redirect({ to: SUPPLIERS_TAB_TARGETS[first] });
}

export const suppliersListRoute = createRoute({
  getParentRoute: () => suppliersRoute,
  path: "/",
  beforeLoad: ({ context: { suppliersTabs } }) => suppliersTabRedirect(suppliersTabs, "suppliers"),
  validateSearch: suppliersListSearch,
  search: { middlewares: [stripSearchParams(suppliersListFilters.parse({}))] },
  component: lazyScreen(() => import("./suppliers-list-page"), "SuppliersListPage"),
});

export const purchasesListRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "purchases",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canRecordPurchases),
  component: lazyScreen(() => import("./purchases-list-page"), "PurchasesListPage"),
});

export const newPurchaseRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "purchases/new",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canRecordPurchases),
  component: lazyScreen(() => import("./new-purchase-page"), "NewPurchasePage"),
});

export const freightsListFilters = z.object({
  search: z.string().default("").catch(""),
  period: freightPeriodSchema.catch(freightPeriodSchema.parse(undefined)),
});

export type FreightsListFilters = z.output<typeof freightsListFilters>;

export const freightsListRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "freights",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageFreights),
  validateSearch: freightsListFilters,
  search: { middlewares: [stripSearchParams(freightsListFilters.parse({}))] },
  component: lazyScreen(() => import("./freights-list-page"), "FreightsListPage"),
});

export const supplierPriceListsRoute = createRoute({
  getParentRoute: () => suppliersRoute,
  path: "price-lists",
  beforeLoad: ({ context: { suppliersTabs } }) =>
    suppliersTabRedirect(suppliersTabs, "price-lists"),
  validateSearch: supplierPriceListsFilters,
  search: { middlewares: [stripSearchParams(supplierPriceListsFilters.parse({}))] },
  component: lazyScreen(() => import("./supplier-price-lists-page"), "SupplierPriceListsPage"),
});

export const legacySupplierPriceListsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "supplier-price-lists",
  validateSearch: supplierPriceListsFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/suppliers/price-lists", search });
  },
});

export const supplierPriceListReviewRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "supplier-price-lists/$listId",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageSupplierPriceLists),
  validateSearch: supplierPriceListReviewFilters,
  search: { middlewares: [stripSearchParams(supplierPriceListReviewFilters.parse({}))] },
  component: lazyScreen(
    () => import("./supplier-price-list-review-page"),
    "SupplierPriceListReviewPage",
  ),
});

export const supplierPriceComparisonRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "price-comparison",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canComparePrices),
  validateSearch: supplierPriceComparisonFilters,
  search: { middlewares: [stripSearchParams(supplierPriceComparisonFilters.parse({}))] },
  component: lazyScreen(
    () => import("./supplier-price-comparison-page"),
    "SupplierPriceComparisonPage",
  ),
});

export const orderSuggestionRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "order-suggestion",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canComparePrices),
  validateSearch: orderSuggestionFilters,
  search: { middlewares: [stripSearchParams(orderSuggestionFilters.parse({}))] },
  component: lazyScreen(() => import("./order-suggestion-page"), "OrderSuggestionPage"),
});

export const purchaseOrdersRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "purchase-orders",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canReadPurchaseOrders),
  validateSearch: purchaseOrdersFilters,
  search: { middlewares: [stripSearchParams(purchaseOrdersFilters.parse({}))] },
  component: lazyScreen(() => import("./purchase-orders-page"), "PurchaseOrdersPage"),
});

export const purchaseOrderRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "purchase-orders/$orderId",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canReadPurchaseOrders),
  component: lazyScreen(() => import("./purchase-order-page"), "PurchaseOrderPage"),
});

export const purchaseOrderReceiveRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "purchase-orders/$orderId/receive",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canReceivePurchaseOrders),
  component: lazyScreen(() => import("./purchase-order-receive-page"), "PurchaseOrderReceivePage"),
});

export const freightReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/freight-by-period",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: reportPeriodSearch,
  search: { middlewares: [stripSearchParams(reportPeriodSearch.parse({}))] },
  component: lazyScreen(() => import("./freight-report-page"), "FreightReportPage"),
});

export const aiCostReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/ai-cost-by-period",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeAiCostReport),
  validateSearch: aiCostReportFilters,
  search: { middlewares: [stripSearchParams(aiCostReportFilters.parse({}))] },
  component: lazyScreen(() => import("./ai-cost-report-page"), "AiCostReportPage"),
});

export const pendingPurchaseOrdersReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/pending-purchase-orders",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: reportPeriodSearch,
  search: { middlewares: [stripSearchParams(reportPeriodSearch.parse({}))] },
  component: lazyScreen(
    () => import("./pending-purchase-orders-report-page"),
    "PendingPurchaseOrdersReportPage",
  ),
});

export const receiptDifferencesReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/receipt-differences",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: reportPeriodSearch,
  search: { middlewares: [stripSearchParams(reportPeriodSearch.parse({}))] },
  component: lazyScreen(
    () => import("./receipt-differences-report-page"),
    "ReceiptDifferencesReportPage",
  ),
});

export const purchasesReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/purchases-by-supplier",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: reportPeriodSearch,
  search: { middlewares: [stripSearchParams(reportPeriodSearch.parse({}))] },
  component: lazyScreen(() => import("./purchases-report-page"), "PurchasesReportPage"),
});
