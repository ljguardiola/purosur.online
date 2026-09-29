import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeeAlertsArea } from "../access/backoffice-access";
import { homeAreaRoute } from "../shell/home-area";
import { lazyScreen } from "../shell/lazy-screen";
import { refuseWithout } from "../shell/signed-in-route";

export const alertsListFilters = z.object({
  level: z.enum(["all", "critical", "warning", "informational"]).default("all").catch("all"),
  status: z.enum(["open", "closed"]).default("open").catch("open"),
  search: z.string().default("").catch(""),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

export type AlertsListFilters = z.output<typeof alertsListFilters>;

export const alertsOverviewRoute = createRoute({
  getParentRoute: () => homeAreaRoute,
  path: "/",
  component: lazyScreen(() => import("./alerts-overview-page"), "AlertsOverviewPage"),
});

export const alertsListRoute = createRoute({
  getParentRoute: () => homeAreaRoute,
  path: "alerts",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeAlertsArea),
  validateSearch: alertsListFilters,
  search: { middlewares: [stripSearchParams(alertsListFilters.parse({}))] },
  component: lazyScreen(() => import("./alerts-list-page"), "AlertsListPage"),
});
