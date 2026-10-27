import type { LossesByReasonReportBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  EmptyState,
  FigureStat,
  formatNumber,
  LoadFailure,
  LoadingPlaceholder,
  plural,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { PackageX } from "lucide-react";
import { useId } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatStockQuantity } from "../platform/stock-quantity";
import type { CloudData } from "../platform/use-cloud-query";
import { ReportFilters } from "../shell/report-filters";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { LossesByReasonReportFilters } from "./losses-by-reason-report-filters";
import type { LossesByReasonReportScreenServices } from "./losses-by-reason-report-services";
import { useLossesByReasonReportQuery } from "./stock-queries";
import { REASON_LABELS } from "./stock-reason-labels";

export type LossesByReasonReportScreenProps = {
  filters: LossesByReasonReportFilters;
  onFiltersChange: (filters: LossesByReasonReportFilters) => void;
  onSessionEnded: () => void;
  services: LossesByReasonReportScreenServices;
};

type ReasonLosses = LossesByReasonReportBody["reasons"][number];
type LostProduct = ReasonLosses["products"][number];

const FAILURE_SUBJECT = "las mermas por motivo";

function lossesText(count: number): string {
  return plural(count, { one: "1 pérdida", other: `${formatNumber(count)} pérdidas` });
}

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
            value={lossesText(report.reasons.reduce((sum, { loss_count }) => sum + loss_count, 0))}
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

const columns = [
  dataColumn({
    id: "product",
    header: "Producto",
    render: (product: LostProduct) => <TableCellText>{product.name}</TableCellText>,
  }),
  dataColumn({
    id: "quantity",
    width: 180,
    header: "Cantidad",
    align: "end",
    render: (product: LostProduct) => (
      <TableCellText strong>
        {formatStockQuantity(product.quantity, product.sale_unit)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "losses",
    width: 120,
    header: "Pérdidas",
    align: "end",
    render: (product: LostProduct) => (
      <TableCellText>{formatNumber(product.loss_count)}</TableCellText>
    ),
  }),
] as const;

function ReasonSection({
  data,
  losses,
}: {
  data: CloudData<LossesByReasonReportBody>;
  losses: ReasonLosses;
}) {
  const headingId = useId();
  const label = REASON_LABELS[losses.reason];
  const table = useTableModel({
    items: losses.products,
    id: (product) => product.id,
    columns,
  });
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-subheading text-text">
          {label}
        </h2>
        <p className="text-detail text-text-subtle">{lossesText(losses.loss_count)}</p>
      </div>
      <Table
        aria-label={`Productos perdidos por ${label}`}
        table={table}
        {...cloudTableState(data, FAILURE_SUBJECT)}
      />
    </section>
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
  const shown = data.status === "loaded" ? data.value : data.lastValue;

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Stock" title="Mermas por motivo" />}
      bodyClassName="gap-4 p-6"
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        answeredPeriod={shown?.range}
      />
      {data.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(data, FAILURE_SUBJECT)} />
      ) : (
        <>
          <SummaryCards report={shown} />
          {shown === undefined ? (
            <LoadingPlaceholder variant="list" items={3} />
          ) : shown.reasons.length === 0 ? (
            <EmptyState
              icon={<PackageX />}
              title="No hay mermas en este período"
              variant={filters.from === "" ? "blank" : "filtered"}
            />
          ) : (
            shown.reasons.map((losses) => (
              <ReasonSection key={losses.reason} data={data} losses={losses} />
            ))
          )}
        </>
      )}
    </ScreenLayout>
  );
}
