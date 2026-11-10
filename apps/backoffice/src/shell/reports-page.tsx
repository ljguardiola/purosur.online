import { SegmentedControl, Select, Tab, Tabs } from "@purosur/ui";
import {
  createLink,
  getRouteApi,
  Outlet,
  useNavigate,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { AreaTopBar } from "./area-top-bar";
import { sharedReportFilters } from "./report-filters-search";
import {
  REPORT_VIEW_LABELS,
  REPORT_VIEW_TABS,
  REPORT_VIEW_TARGETS,
  REPORT_VIEW_TITLES,
  REPORTS_TAB_LABELS,
  type ReportView,
  reportsTabsOf,
  reportViewsOfTab,
} from "./reports-tabs";
import { ScreenLayout } from "./screen-layout";

const route = getRouteApi("/signed-in/reports-area/reports");

const ReportsTabLink = createLink(Tab);

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
        tabs={reportsTabsOf(reportViews).map(({ tab, firstView }) => (
          <ReportsTabLink
            key={tab}
            to={REPORT_VIEW_TARGETS[firstView]}
            search={shared}
            value={tab}
            label={REPORTS_TAB_LABELS[tab]}
          />
        ))}
      >
        <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
          {firstOption === undefined || otherOptions.length === 0 ? null : (
            <ReportViewPicker
              options={[firstOption, ...otherOptions]}
              value={selectedView}
              onChange={(view) => void navigate({ to: REPORT_VIEW_TARGETS[view], search: shared })}
            />
          )}
          <Outlet />
        </div>
      </Tabs>
    </ScreenLayout>
  );
}

type ReportViewOption = { value: ReportView; label: string };

type ReportViewPickerProps = {
  options: readonly [ReportViewOption, ...ReportViewOption[]];
  value: ReportView;
  onChange: (view: ReportView) => void;
};

function ReportViewPicker({ options, value, onChange }: ReportViewPickerProps) {
  const [fits, setFits] = useState(true);

  function observeFit(area: HTMLDivElement | null) {
    const natural = area?.firstElementChild;
    if (area === null || area === undefined || !(natural instanceof HTMLElement)) {
      return;
    }
    const measure = () => setFits(natural.offsetWidth <= area.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(natural);
    return () => observer.disconnect();
  }

  return (
    <div ref={observeFit} className="relative overflow-hidden">
      <div aria-hidden="true" className="invisible absolute top-0 left-0 w-max">
        <SegmentedControl<ReportView>
          label="Reporte"
          options={options}
          value={value}
          onChange={() => {}}
        />
      </div>
      {fits ? (
        <SegmentedControl<ReportView>
          label="Reporte"
          options={options}
          value={value}
          onChange={onChange}
        />
      ) : (
        <div className="max-w-80">
          <Select<ReportView>
            name="report"
            label="Reporte"
            options={options}
            value={value}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
}
