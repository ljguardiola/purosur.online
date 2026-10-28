import type { LossesByReasonReportBody } from "@purosur/contracts";
import {
  Card,
  EmptyState,
  FigureStat,
  formatNumber,
  LoadFailure,
  LoadingPlaceholder,
} from "@purosur/ui";
import { PackageX } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { ReportFilters } from "../shell/report-filters";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { lossCountText } from "./loss-count-text";
import type { LossesByReasonReportFilters } from "./losses-by-reason-report-filters";
import { LossesByReasonReportReasonSection } from "./losses-by-reason-report-reason-section";
import type { LossesByReasonReportScreenServices } from "./losses-by-reason-report-services";
import { useLossesByReasonReportQuery } from "./stock-queries";

export type LossesByReasonReportScreenProps = {
  filters: LossesByReasonReportFilters;
  onFiltersChange: (filters: LossesByReasonReportFilters) => void;
  onSessionEnded: () => void;
  services: LossesByReasonReportScreenServices;
};

const FAILURE_SUBJECT = "las mermas por motivo";

function SummaryCards({ report }: { report: LossesByReasonReportBody | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        {report === undefined ? (
          <FigureStat size="heading" label="Pérdidas" loading />
        ) : (
          <FigureStat
            size="heading"
            label="Pérdidas"
            value={lossCountText(
              report.reasons.reduce((sum, { loss_count }) => sum + loss_count, 0),
            )}
          />
        )}
      </Card>
      <Card>
        {report === undefined ? (
          <FigureStat size="heading" label="Motivos" loading />
        ) : (
          <FigureStat size="heading" label="Motivos" value={formatNumber(report.reasons.length)} />
        )}
      </Card>
    </div>
  );
}

export function LossesByReasonReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: LossesByReasonReportScreenProps) {
  const data = useLossesByReasonReportQuery({
    query: filters.from === "" ? {} : { from: filters.from, to: filters.to },
    fetchLossesByReasonReport: services.fetchLossesByReasonReport,
    onSessionEnded,
  });
  const report = data.status === "loaded" ? data.value : undefined;

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Stock" title="Mermas por motivo" />}
      bodyClassName="gap-4 p-6"
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        answeredPeriod={data.status === "loaded" ? data.value.range : data.lastValue?.range}
      />
      {data.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(data, FAILURE_SUBJECT)} />
      ) : (
        <>
          <SummaryCards report={report} />
          {report === undefined ? (
            <LoadingPlaceholder variant="list" items={3} />
          ) : report.reasons.length === 0 ? (
            <EmptyState
              icon={<PackageX />}
              title="No hay mermas en este período"
              variant={filters.from === "" ? "blank" : "filtered"}
            />
          ) : (
            report.reasons.map((losses) => (
              <LossesByReasonReportReasonSection
                key={losses.reason}
                losses={losses}
                refreshing={data.status === "loaded" && data.refreshing}
              />
            ))
          )}
        </>
      )}
    </ScreenLayout>
  );
}
