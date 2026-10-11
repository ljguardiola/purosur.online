import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeeRefundsArea } from "../shell/backoffice-access";
import { cashAndFiscalAreaRoute } from "../shell/cash-and-fiscal-area";
import { lazyScreen } from "../shell/lazy-screen";
import { refuseWithout } from "../shell/signed-in-route";

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
