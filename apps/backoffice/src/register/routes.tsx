import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { lazyScreen } from "../shell/lazy-screen";
import {
  reportFiltersFields,
  reportFiltersSearch,
  withoutRefusedPeriod,
} from "../shell/report-filters-search";
import { salesAndCashAreaRoute } from "../shell/sales-and-cash-area";
import { refuseWithout, signedInRoute } from "../shell/signed-in-route";
import {
  canSeeRegistersTabs,
  REGISTERS_TAB_TARGETS,
  REGISTERS_TABS,
  type RegistersTab,
} from "./registers-tabs";

export const registersRoute = createRoute({
  getParentRoute: () => salesAndCashAreaRoute,
  path: "registers",
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeeRegistersTabs);
    return {
      registersTabs: REGISTERS_TABS.filter((tab) => tab.isVisibleTo(session)).map((tab) => tab.key),
    };
  },
  component: lazyScreen(() => import("./register-layout"), "RegisterLayout"),
});

function registersTabRedirect(registersTabs: readonly RegistersTab[], own: RegistersTab): void {
  const [first] = registersTabs;
  if (first !== undefined && !registersTabs.includes(own)) {
    throw redirect({ to: REGISTERS_TAB_TARGETS[first] });
  }
}

export const registersSearch = z
  .object({
    register: z.string().optional().catch(undefined),
    tab: z.enum(["data", "fiscal", "backups", "sessions"]).optional().catch(undefined),
    from: reportFiltersFields.from,
    to: reportFiltersFields.to,
  })
  .transform(withoutRefusedPeriod);

export const registersListRoute = createRoute({
  getParentRoute: () => registersRoute,
  path: "/",
  beforeLoad: ({ context: { registersTabs } }) => registersTabRedirect(registersTabs, "registers"),
  validateSearch: registersSearch,
  search: { middlewares: [stripSearchParams(registersSearch.parse({}))] },
  component: lazyScreen(() => import("./registers-list-page"), "RegistersListPage"),
});

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
