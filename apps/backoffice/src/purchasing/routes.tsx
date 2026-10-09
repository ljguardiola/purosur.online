import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canManageSuppliers } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { refuseWithout } from "../shell/signed-in-route";
import { stockAreaRoute } from "../shell/stock-area";

export const suppliersListFilters = z.object({
  search: z.string().default("").catch(""),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type SuppliersListFilters = z.output<typeof suppliersListFilters>;

export const suppliersListRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "suppliers",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageSuppliers),
  validateSearch: suppliersListFilters,
  search: { middlewares: [stripSearchParams(suppliersListFilters.parse({}))] },
  component: lazyScreen(() => import("./suppliers-list-page"), "SuppliersListPage"),
});
