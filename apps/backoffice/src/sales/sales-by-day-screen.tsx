import type { SalesReportBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Receipt } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { ReportFilters } from "../shell/report-filters";
import {
  type ReportFilters as ReportFiltersValue,
  reportQueryOf,
} from "../shell/report-filters-search";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { SalesByDayScreenServices } from "./sales-by-day-services";
import { useReportRegistersQuery, useSalesReportQuery } from "./sales-queries";

export type SalesByDayScreenProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  services: SalesByDayScreenServices;
};

type SalesOfDay = SalesReportBody["days"][number];

const NO_DAYS: SalesOfDay[] = [];

const columns = [
  dataColumn({
    id: "day",
    header: "Día",
    render: (sales: SalesOfDay) => formatDisplayDate(sales.day),
  }),
  dataColumn({
    id: "sales",
    header: "Ventas",
    align: "end",
    render: (sales: SalesOfDay) => formatNumber(sales.sales_count),
  }),
  dataColumn({
    id: "total",
    header: "Total",
    align: "end",
    render: (sales: SalesOfDay) => formatCents(sales.total),
  }),
] as const;

export function SalesByDayScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: SalesByDayScreenProps) {
  const registerChosen = filters.register !== "ALL";
  const registers = useReportRegistersQuery({
    fetchReportRegisters: services.fetchReportRegisters,
    onSessionEnded,
  });
  const data = useSalesReportQuery({
    query: reportQueryOf(filters),
    fetchSalesReport: services.fetchSalesReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const days = shown?.days ?? NO_DAYS;
  const table = useTableModel({ items: days, id: (sales) => sales.day, columns });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes" title="Ventas por día o por rango" />}
      bodyClassName="gap-4 p-6"
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        registers={registers}
        answeredPeriod={shown?.range}
      />
      {data.status === "failed" ? null : (
        <Card>
          <div className="grid grid-cols-2 gap-6">
            {shown ? (
              <>
                <FigureStat
                  size="heading"
                  label="Total vendido"
                  value={formatCents(shown.totals.total)}
                />
                <FigureStat
                  size="heading"
                  label="Cantidad de ventas"
                  value={formatNumber(shown.totals.sales_count)}
                />
              </>
            ) : (
              <>
                <FigureStat size="heading" label="Total vendido" loading />
                <FigureStat size="heading" label="Cantidad de ventas" loading />
              </>
            )}
          </div>
        </Card>
      )}
      <Table
        aria-label="Ventas por día"
        table={table}
        {...cloudTableState(data, "el reporte de ventas")}
        empty={{
          icon: <Receipt />,
          title: registerChosen
            ? "No hay ventas de esta caja en este período"
            : "No hay ventas en este período",
          variant: registerChosen ? "filtered" : "blank",
        }}
      />
    </ScreenLayout>
  );
}
