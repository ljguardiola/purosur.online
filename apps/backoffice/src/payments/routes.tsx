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
export const ALL_METHODS = "all";

export const mercadoPagoRefundsFilters = z.object({
  register: z.string().default(ALL_REGISTERS).catch(ALL_REGISTERS),
});

export type MercadoPagoRefundsFilters = z.output<typeof mercadoPagoRefundsFilters>;

export const outsideRefundsFilters = z.object({
  register: z.string().default(ALL_REGISTERS).catch(ALL_REGISTERS),
  method: z.string().default(ALL_METHODS).catch(ALL_METHODS),
});

export type OutsideRefundsFilters = z.output<typeof outsideRefundsFilters>;

export const mercadoPagoRefundsRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "refunds/mercado-pago",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRefundsArea),
  validateSearch: mercadoPagoRefundsFilters,
  search: { middlewares: [stripSearchParams(mercadoPagoRefundsFilters.parse({}))] },
  component: lazyScreen(() => import("./mercado-pago-refunds-page"), "MercadoPagoRefundsPage"),
});

export const outsideRefundsRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "refunds/outside-the-system",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRefundsArea),
  validateSearch: outsideRefundsFilters,
  search: { middlewares: [stripSearchParams(outsideRefundsFilters.parse({}))] },
  component: lazyScreen(() => import("./outside-refunds-page"), "OutsideRefundsPage"),
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
