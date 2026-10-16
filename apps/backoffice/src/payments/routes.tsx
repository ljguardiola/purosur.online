import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeeRefundsArea, canSeeReports } from "../shell/backoffice-access";
import { cashAndFiscalAreaRoute } from "../shell/cash-and-fiscal-area";
import { lazyScreen } from "../shell/lazy-screen";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout } from "../shell/signed-in-route";
import { handConfirmedPaymentsFilters } from "./hand-confirmed-payments-filters";
import { salesByPaymentMethodFilters } from "./sales-by-payment-method-filters";

export const ALL_REGISTERS = "all";

export const pendingRefundsFilters = z.object({
  register: z.string().default(ALL_REGISTERS).catch(ALL_REGISTERS),
});

export type PendingRefundsFilters = z.output<typeof pendingRefundsFilters>;

export const pendingRefundsRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "pending-refunds",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRefundsArea),
  validateSearch: pendingRefundsFilters,
  search: { middlewares: [stripSearchParams(pendingRefundsFilters.parse({}))] },
  component: lazyScreen(() => import("./pending-refunds-page"), "PendingRefundsPage"),
});

export const salesByPaymentMethodRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/sales-by-payment-method",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: salesByPaymentMethodFilters,
  search: { middlewares: [stripSearchParams(salesByPaymentMethodFilters.parse({}))] },
  component: lazyScreen(() => import("./sales-by-payment-method-page"), "SalesByPaymentMethodPage"),
});

export const handConfirmedPaymentsRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/hand-confirmed-payments",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: handConfirmedPaymentsFilters,
  search: { middlewares: [stripSearchParams(handConfirmedPaymentsFilters.parse({}))] },
  component: lazyScreen(
    () => import("./hand-confirmed-payments-page"),
    "HandConfirmedPaymentsPage",
  ),
});
