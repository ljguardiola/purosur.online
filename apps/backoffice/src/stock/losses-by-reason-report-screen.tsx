import { AreaTopBar } from "../shell/area-top-bar";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import { ScreenLayout } from "../shell/screen-layout";
import { LossesByReasonReportContent, REPORT_TITLE } from "./losses-by-reason-report-content";
import type { LossesByReasonReportScreenServices } from "./losses-by-reason-report-services";

export type LossesByReasonReportScreenProps = {
  filters: ReportPeriodFilters;
  onFiltersChange: (filters: ReportPeriodFilters) => void;
  onSessionEnded: () => void;
  services: LossesByReasonReportScreenServices;
};

export function LossesByReasonReportScreen(props: LossesByReasonReportScreenProps) {
  return (
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Reportes · Stock" title={REPORT_TITLE} />}
      bodyClassName="gap-4 p-6"
    >
      <LossesByReasonReportContent {...props} />
    </ScreenLayout>
  );
}
