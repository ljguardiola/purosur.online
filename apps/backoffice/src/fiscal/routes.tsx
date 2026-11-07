import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import {
  canSeeContingencyTicketRescue,
  canSeeFiscalPage,
  canSeeReports,
} from "../shell/backoffice-access";
import { fiscalAreaRoute } from "../shell/fiscal-area";
import { lazyScreen } from "../shell/lazy-screen";
import { reportFiltersSearch } from "../shell/report-filters-search";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout, signedInRoute } from "../shell/signed-in-route";
import { exceptionalityFilters } from "./exceptionality-filters";
import {
  FISCAL_TAB_TARGETS,
  FISCAL_TABS,
  type FiscalTab,
  POINTS_OF_SALE_ANCHOR,
} from "./fiscal-tabs";
import { voucherKeySchema } from "./issued-fiscal-document-voucher";
import { issuedFiscalDocumentsFilters } from "./issued-fiscal-documents-filters";

export const caeaSearch = exceptionalityFilters.extend({
  assistant: z.enum(["contingency-ticket-rescue"]).optional().catch(undefined),
});

export const issuedFiscalDocumentsSearch = z
  .object({ document: voucherKeySchema.optional().catch(undefined) })
  .and(issuedFiscalDocumentsFilters);

export const fiscalRoute = createRoute({
  getParentRoute: () => fiscalAreaRoute,
  path: "fiscal",
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeeFiscalPage);
    return {
      fiscalTabs: FISCAL_TABS.filter((tab) => tab.isVisibleTo(session)).map((tab) => tab.key),
    };
  },
  component: lazyScreen(() => import("./fiscal-layout"), "FiscalLayout"),
});

function fiscalTabRedirect(fiscalTabs: readonly FiscalTab[], own: FiscalTab): void {
  const [first] = fiscalTabs;
  if (first !== undefined && !fiscalTabs.includes(own)) {
    throw redirect({ to: FISCAL_TAB_TARGETS[first] });
  }
}

export const fiscalTasksRoute = createRoute({
  getParentRoute: () => fiscalRoute,
  path: "/",
  beforeLoad: ({ context: { fiscalTabs } }) => fiscalTabRedirect(fiscalTabs, "tasks"),
  component: lazyScreen(() => import("./fiscal-tasks-page"), "FiscalTasksPage"),
});

export const issuedFiscalDocumentsRoute = createRoute({
  getParentRoute: () => fiscalRoute,
  path: "documents",
  beforeLoad: ({ context: { fiscalTabs } }) => fiscalTabRedirect(fiscalTabs, "documents"),
  validateSearch: issuedFiscalDocumentsSearch,
  search: { middlewares: [stripSearchParams(issuedFiscalDocumentsFilters.parse({}))] },
  component: lazyScreen(
    () => import("./issued-fiscal-documents-page"),
    "IssuedFiscalDocumentsPage",
  ),
});

export const caeaRoute = createRoute({
  getParentRoute: () => fiscalRoute,
  path: "caea",
  validateSearch: caeaSearch,
  search: { middlewares: [stripSearchParams(exceptionalityFilters.parse({}))] },
  beforeLoad: ({ context: { session, fiscalTabs }, search }) => {
    fiscalTabRedirect(fiscalTabs, "caea");
    if (search.assistant !== undefined && !canSeeContingencyTicketRescue(session)) {
      throw redirect({
        to: ".",
        search: (previous) => ({ ...previous, assistant: undefined }),
        replace: true,
      });
    }
  },
  component: lazyScreen(() => import("./caea-page"), "CaeaPage"),
});

export const fiscalSettingsRoute = createRoute({
  getParentRoute: () => fiscalRoute,
  path: "settings",
  beforeLoad: ({ context: { fiscalTabs } }) => fiscalTabRedirect(fiscalTabs, "settings"),
  component: lazyScreen(() => import("./fiscal-settings-page"), "FiscalSettingsPage"),
});

export const issuedFiscalDocumentsReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/fiscal-documents",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: reportFiltersSearch,
  search: { middlewares: [stripSearchParams(reportFiltersSearch.parse({}))] },
  component: lazyScreen(
    () => import("./issued-fiscal-documents-report-page"),
    "IssuedFiscalDocumentsReportPage",
  ),
});

export const legacyFiscalTasksRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "fiscal-tasks",
  beforeLoad: () => {
    throw redirect({ to: "/fiscal" });
  },
});

export const legacyFiscalDocumentsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "fiscal-documents",
  validateSearch: issuedFiscalDocumentsFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/fiscal/documents", search });
  },
});

export const legacyExceptionalityRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "exceptionality",
  validateSearch: exceptionalityFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/fiscal/caea", search });
  },
});

export const legacyPointsOfSaleRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "points-of-sale",
  beforeLoad: () => {
    throw redirect({ to: "/fiscal/caea", hash: POINTS_OF_SALE_ANCHOR });
  },
});

export const legacyFiscalSettingsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "fiscal-settings",
  beforeLoad: () => {
    throw redirect({ to: "/fiscal/settings" });
  },
});

export const legacyContingencyTicketRescueRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "contingency-ticket-rescue",
  beforeLoad: () => {
    throw redirect({
      to: "/fiscal/caea",
      search: { fiscalAddress: "", assistant: "contingency-ticket-rescue" },
    });
  },
});
