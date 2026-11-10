import { createRoute, redirect } from "@tanstack/react-router";
import { canSeeReportsPage } from "./backoffice-access";
import { lazyScreen } from "./lazy-screen";
import { sharedReportFilters } from "./report-filters-search";
import { reportsAreaRoute } from "./reports-area";
import {
  REPORT_VIEW_TABS,
  REPORT_VIEW_TARGETS,
  REPORT_VIEWS,
  type ReportView,
  reportViewsOfTab,
} from "./reports-tabs";
import { refuseWithout } from "./signed-in-route";

export const reportsRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports",
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeeReportsPage);
    return {
      reportViews: REPORT_VIEWS.filter((view) => view.isVisibleTo(session)).map((view) => view.key),
    };
  },
  component: lazyScreen(() => import("./reports-page"), "ReportsPage"),
});

function firstReportView(reportViews: readonly ReportView[], own?: ReportView): ReportView {
  const inOwnTab = own === undefined ? [] : reportViewsOfTab(reportViews, REPORT_VIEW_TABS[own]);
  const [first] = inOwnTab.length > 0 ? inOwnTab : reportViews;
  return first ?? "sales-by-day";
}

export function reportViewRedirect(
  reportViews: readonly ReportView[],
  own: ReportView,
  search: object,
): void {
  if (!reportViews.includes(own)) {
    throw redirect({
      to: REPORT_VIEW_TARGETS[firstReportView(reportViews, own)],
      search: sharedReportFilters(search),
    });
  }
}

export const reportsLandingRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: "/",
  beforeLoad: ({ context: { reportViews } }) => {
    throw redirect({ to: REPORT_VIEW_TARGETS[firstReportView(reportViews)] });
  },
});
