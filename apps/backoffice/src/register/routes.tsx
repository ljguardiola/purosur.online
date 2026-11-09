import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { lazyScreen } from "../shell/lazy-screen";
import { registersRoute, registersTabRedirect } from "../shell/registers-route";
import { reportFiltersSearch } from "../shell/report-filters-search";
import { signedInRoute } from "../shell/signed-in-route";

export const cashSessionClosesRoute = createRoute({
  getParentRoute: () => registersRoute,
  path: "closes",
  beforeLoad: ({ context: { registersTabs } }) => registersTabRedirect(registersTabs, "closes"),
  validateSearch: reportFiltersSearch,
  search: { middlewares: [stripSearchParams(reportFiltersSearch.parse({}))] },
  component: lazyScreen(() => import("./cash-session-closes-page"), "CashSessionClosesPage"),
});

export const cashMovementsRoute = createRoute({
  getParentRoute: () => registersRoute,
  path: "movements",
  beforeLoad: ({ context: { registersTabs } }) => registersTabRedirect(registersTabs, "movements"),
  validateSearch: reportFiltersSearch,
  search: { middlewares: [stripSearchParams(reportFiltersSearch.parse({}))] },
  component: lazyScreen(() => import("./cash-movements-page"), "CashMovementsPage"),
});

export const legacyBackupsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "backups",
  validateSearch: z.object({ register: z.string().optional().catch(undefined) }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/registers",
      search: search.register === undefined ? {} : { register: search.register, tab: "backups" },
    });
  },
});

export const legacyCashSessionClosesRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "reports/cash-session-closes",
  validateSearch: reportFiltersSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/registers/closes", search });
  },
});

export const legacyCashMovementsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "reports/cash-movements",
  validateSearch: reportFiltersSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/registers/movements", search });
  },
});
