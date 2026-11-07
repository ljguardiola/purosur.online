import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { homeAreaRoute } from "../shell/home-area";
import { lazyScreen } from "../shell/lazy-screen";
import { ALERTS_LIST_ANCHOR } from "./alerts-list-anchor";

export const alertsListFilters = z.object({
  level: z.enum(["all", "critical", "warning", "informational"]).default("all").catch("all"),
  status: z.enum(["open", "closed"]).default("open").catch("open"),
  search: z.string().default("").catch(""),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

export type AlertsListFilters = z.output<typeof alertsListFilters>;

export const homeRoute = createRoute({
  getParentRoute: () => homeAreaRoute,
  path: "/",
  validateSearch: alertsListFilters,
  search: { middlewares: [stripSearchParams(alertsListFilters.parse({}))] },
  component: lazyScreen(() => import("../shell/home-page"), "HomePage"),
});

export const alertsRedirectRoute = createRoute({
  getParentRoute: () => homeAreaRoute,
  path: "alerts",
  validateSearch: alertsListFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search, hash: ALERTS_LIST_ANCHOR, replace: true });
  },
});
