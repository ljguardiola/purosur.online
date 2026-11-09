import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { registersRoute, registersTabRedirect } from "../register/routes";
import { lazyScreen } from "./lazy-screen";
import { reportFiltersFields, withoutRefusedPeriod } from "./report-filters-search";

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
  component: lazyScreen(() => import("../installation/registers-list-page"), "RegistersListPage"),
});
