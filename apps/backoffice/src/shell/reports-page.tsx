import { SegmentedControl, Tab, Tabs } from "@purosur/ui";
import {
  createLink,
  getRouteApi,
  Outlet,
  useNavigate,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "./area-top-bar";
import { sharedReportFilters } from "./report-filters-search";
import {
  REPORT_VIEW_LABELS,
  REPORT_VIEW_TABS,
  REPORT_VIEW_TARGETS,
  REPORT_VIEW_TITLES,
  REPORTS_TAB_LABELS,
  type ReportsTab,
  type ReportView,
  reportViewsOfTab,
} from "./reports-tabs";
import { ScreenLayout } from "./screen-layout";

const route = getRouteApi("/signed-in/reports-area/reports");

const ReportsTabLink = createLink(Tab);

const TABS: readonly ReportsTab[] = ["sales", "discounts", "profitability"];

export function ReportsPage(): ReactElement {
  const { reportViews } = route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const shared = sharedReportFilters(search);
  const selectedView =
    reportViews.find((view) => REPORT_VIEW_TARGETS[view] === pathname) ?? reportViews[0];
  if (selectedView === undefined) {
    return <Outlet />;
  }
  const selectedTab = REPORT_VIEW_TABS[selectedView];
  const [firstOption, ...otherOptions] = reportViewsOfTab(reportViews, selectedTab).map((view) => ({
    value: view,
    label: REPORT_VIEW_LABELS[view],
  }));

  return (
    <ScreenLayout
      topBar={
        <AreaTopBar
          eyebrow={`Reportes · ${REPORTS_TAB_LABELS[selectedTab]}`}
          title={REPORT_VIEW_TITLES[selectedView]}
        />
      }
      bodyClassName="p-0"
    >
      <Tabs
        label="Secciones de Reportes"
        selectedTab={selectedTab}
        tabs={TABS.flatMap((tab) => {
          const [first] = reportViewsOfTab(reportViews, tab);
          return first === undefined
            ? []
            : [
                <ReportsTabLink
                  key={tab}
                  to={REPORT_VIEW_TARGETS[first]}
                  search={shared}
                  value={tab}
                  label={REPORTS_TAB_LABELS[tab]}
                />,
              ];
        })}
      >
        <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
          {firstOption === undefined || otherOptions.length === 0 ? null : (
            <div>
              <SegmentedControl<ReportView>
                label="Reporte"
                options={[firstOption, ...otherOptions]}
                value={selectedView}
                onChange={(view) =>
                  void navigate({ to: REPORT_VIEW_TARGETS[view], search: shared })
                }
              />
            </div>
          )}
          <Outlet />
        </div>
      </Tabs>
    </ScreenLayout>
  );
}
