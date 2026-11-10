import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeeMercadoPagoChargeCosts, canSeeReports } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { refundsRoute, refundsTabRedirect } from "../shell/refunds-route";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout, signedInRoute } from "../shell/signed-in-route";
import { handConfirmedPaymentsFilters } from "./hand-confirmed-payments-filters";
import { mercadoPagoChargeCostsFilters } from "./mercado-pago-charge-costs-filters";
import { salesByPaymentMethodFilters } from "./sales-by-payment-method-filters";

export const ALL_REGISTERS = "all";
export const ALL_METHODS = "all";

export const PENDING_REFUNDS_CHANNELS = ["all", "mercado-pago", "without-api"] as const;

export const pendingRefundsFilters = z.object({
  channel: z.enum(PENDING_REFUNDS_CHANNELS).default("all").catch("all"),
  register: z.string().default(ALL_REGISTERS).catch(ALL_REGISTERS),
  method: z.string().default(ALL_METHODS).catch(ALL_METHODS),
});

export type PendingRefundsFilters = z.output<typeof pendingRefundsFilters>;

export const pendingRefundsRoute = createRoute({
  getParentRoute: () => refundsRoute,
  path: "/",
  beforeLoad: ({ context: { refundsTabs } }) => refundsTabRedirect(refundsTabs, "pending"),
  validateSearch: pendingRefundsFilters,
  search: { middlewares: [stripSearchParams(pendingRefundsFilters.parse({}))] },
  component: lazyScreen(() => import("./pending-refunds-page"), "PendingRefundsPage"),
});

export const legacyMercadoPagoRefundsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "refunds/mercado-pago",
  validateSearch: z.object({ register: pendingRefundsFilters.shape.register }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/refunds",
      search: { channel: "mercado-pago", register: search.register },
    });
  },
});

export const legacyOutsideRefundsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "refunds/outside-the-system",
  validateSearch: z.object({
    register: pendingRefundsFilters.shape.register,
    method: pendingRefundsFilters.shape.method,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/refunds",
      search: { channel: "without-api", register: search.register, method: search.method },
    });
  },
});

export const salesByPaymentMethodRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/sales-by-payment-method",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: salesByPaymentMethodFilters,
  search: { middlewares: [stripSearchParams(salesByPaymentMethodFilters.parse({}))] },
  component: lazyScreen(() => import("./sales-by-payment-method-page"), "SalesByPaymentMethodPage"),
});

export const legacyHandConfirmedPaymentsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "reports/hand-confirmed-payments",
  validateSearch: handConfirmedPaymentsFilters,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/reports/sales-by-payment-method",
      search: { ...search, handConfirmed: true },
    });
  },
});

export const mercadoPagoChargeCostsRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/mercado-pago-charge-costs",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeMercadoPagoChargeCosts),
  validateSearch: mercadoPagoChargeCostsFilters,
  search: { middlewares: [stripSearchParams(mercadoPagoChargeCostsFilters.parse({}))] },
  component: lazyScreen(
    () => import("./mercado-pago-charge-costs-page"),
    "MercadoPagoChargeCostsPage",
  ),
});
