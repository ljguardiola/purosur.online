import { freightPeriodSchema, recordIdSchema } from "@purosur/contracts";
import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import {
  canManageFreights,
  canManageSupplierPriceLists,
  canReceivePurchaseOrders,
  canRecordPurchases,
  canSeeAiCostReport,
  canSeePurchaseOrdersPage,
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
import { purchaseOrdersFilters, purchaseOrdersListSearch } from "./purchase-orders-filters";
import {
  PURCHASE_ORDERS_TAB_TARGETS,
  PURCHASE_ORDERS_TABS,
  type PurchaseOrdersTab,
} from "./purchase-orders-tabs";
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

const supplierFilterSearch = z.object({ supplier: recordIdSchema().optional().catch(undefined) });

export const purchasesListRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "purchases",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canRecordPurchases),
  validateSearch: supplierFilterSearch,
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

const freightsListSearch = freightsListFilters.extend(supplierFilterSearch.shape);

export type FreightsListFilters = z.output<typeof freightsListFilters>;

export const freightsListRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "freights",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageFreights),
  validateSearch: freightsListSearch,
  search: { middlewares: [stripSearchParams(freightsListFilters.parse({}))] },
  component: lazyScreen(() => import("./freights-list-page"), "FreightsListPage"),
});

export const supplierPriceListsRoute = createRoute({
  getParentRoute: () => suppliersRoute,
  path: "price-lists",
  beforeLoad: ({ context: { suppliersTabs } }) =>
    suppliersTabRedirect(suppliersTabs, "price-lists"),
  validateSearch: supplierPriceListsFilters.extend(supplierFilterSearch.shape),
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

export const purchaseOrdersRoute = createRoute({
  getParentRoute: () => purchasingAreaRoute,
  path: "purchase-orders",
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeePurchaseOrdersPage);
    return {
      purchaseOrdersTabs: PURCHASE_ORDERS_TABS.filter((tab) => tab.isVisibleTo(session)).map(
        (tab) => tab.key,
      ),
    };
  },
  component: lazyScreen(() => import("./purchase-orders-page"), "PurchaseOrdersPage"),
});

function purchaseOrdersTabRedirect(
  purchaseOrdersTabs: readonly PurchaseOrdersTab[],
  own: PurchaseOrdersTab,
): void {
  const [first] = purchaseOrdersTabs;
  if (first === undefined || purchaseOrdersTabs.includes(own)) {
    return;
  }
  throw redirect({ to: PURCHASE_ORDERS_TAB_TARGETS[first] });
}

export const purchaseOrdersListRoute = createRoute({
  getParentRoute: () => purchaseOrdersRoute,
  path: "/",
  beforeLoad: ({ context: { purchaseOrdersTabs } }) =>
    purchaseOrdersTabRedirect(purchaseOrdersTabs, "orders"),
  validateSearch: purchaseOrdersListSearch,
  search: { middlewares: [stripSearchParams(purchaseOrdersFilters.parse({}))] },
  component: lazyScreen(() => import("./purchase-orders-list-page"), "PurchaseOrdersListPage"),
});

export const supplierPriceComparisonRoute = createRoute({
  getParentRoute: () => purchaseOrdersRoute,
  path: "comparison",
  beforeLoad: ({ context: { purchaseOrdersTabs } }) =>
    purchaseOrdersTabRedirect(purchaseOrdersTabs, "comparison"),
  validateSearch: supplierPriceComparisonFilters,
  search: { middlewares: [stripSearchParams(supplierPriceComparisonFilters.parse({}))] },
  component: lazyScreen(
    () => import("./supplier-price-comparison-page"),
    "SupplierPriceComparisonPage",
  ),
});

export const orderSuggestionRoute = createRoute({
  getParentRoute: () => purchaseOrdersRoute,
  path: "suggestion",
  beforeLoad: ({ context: { purchaseOrdersTabs } }) =>
    purchaseOrdersTabRedirect(purchaseOrdersTabs, "suggestion"),
  validateSearch: orderSuggestionFilters,
  search: { middlewares: [stripSearchParams(orderSuggestionFilters.parse({}))] },
  component: lazyScreen(() => import("./order-suggestion-page"), "OrderSuggestionPage"),
});

export const legacyOrderSuggestionRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "order-suggestion",
  validateSearch: orderSuggestionFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/purchase-orders/suggestion", search });
  },
});

export const legacySupplierPriceComparisonRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "price-comparison",
  validateSearch: supplierPriceComparisonFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/purchase-orders/comparison", search });
  },
});

export const legacyPurchaseOrderRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "purchase-orders/$orderId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/purchase-orders", search: { order: params.orderId } });
  },
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
