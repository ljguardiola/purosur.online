import type { FreightByPeriodBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Truck } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ReportFilters } from "../shell/report-filters";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { FreightReportScreenServices } from "./freight-report-services";
import { useFreightReportQuery } from "./purchasing-queries";
import { reportMonthText } from "./report-month-text";
import type { ReportPeriodFilters } from "./report-period-filters";

export type FreightReportScreenProps = {
  filters: ReportPeriodFilters;
  onFiltersChange: (filters: ReportPeriodFilters) => void;
  onSessionEnded: () => void;
  services: FreightReportScreenServices;
};

type FreightRow = FreightByPeriodBody["months"][number];

const NO_ROWS: FreightRow[] = [];

const freightColumns = [
  dataColumn({
    id: "month",
    header: "Mes",
    render: (row: FreightRow) => reportMonthText(row.month),
  }),
  dataColumn({
    id: "freights",
    header: "Fletes",
    align: "end",
    render: (row: FreightRow) => formatNumber(row.freights),
  }),
  dataColumn({
    id: "amount",
    header: "Monto",
    align: "end",
    render: (row: FreightRow) => formatCents(row.amount),
  }),
] as const;

export function FreightReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: FreightReportScreenProps) {
  const data = useFreightReportQuery({
    query: filters.from === "" ? {} : { from: filters.from, to: filters.to },
    fetchFreightReport: services.fetchFreightReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.months ?? NO_ROWS,
    id: (row) => row.month,
    columns: freightColumns,
  });
  const cards = [
    { label: "Total de fletes", value: shown && formatCents(shown.totals.amount) },
    { label: "Fletes", value: shown && formatNumber(shown.totals.freights) },
  ];

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Compras" title="Flete por período" />}
      bodyClassName="gap-4 p-6"
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        answeredPeriod={shown?.range}
      />
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-2 gap-4">
          {cards.map(({ label, value }) => (
            <Card key={label}>
              {value === undefined ? (
                <FigureStat size="heading" label={label} loading />
              ) : (
                <FigureStat size="heading" label={label} value={value} />
              )}
            </Card>
          ))}
        </div>
      )}
      <Table
        aria-label="Flete por período"
        table={table}
        {...cloudTableState(data, "el flete por período")}
        empty={{
          icon: <Truck />,
          title: "No hay fletes en este período",
          variant: filters.from === "" ? "blank" : "filtered",
        }}
      />
    </ScreenLayout>
  );
}
