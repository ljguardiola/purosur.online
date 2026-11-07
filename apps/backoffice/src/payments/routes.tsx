import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeeReports } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { refundsRoute, refundsTabRedirect } from "../shell/refunds-route";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout, signedInRoute } from "../shell/signed-in-route";
import { handConfirmedPaymentsFilters } from "./hand-confirmed-payments-filters";
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
