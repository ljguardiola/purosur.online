import type { AverageTicketBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  formatSignedTenthsOfPercent,
  plural,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { Receipt } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ReportFilters } from "../shell/report-filters";
import { reportQueryOf } from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { AverageTicketFilters } from "./average-ticket-filters";
import type { AverageTicketScreenServices } from "./average-ticket-services";
import { reportPeriodText } from "./report-period-text";
import { useAverageTicketQuery } from "./sales-queries";

export type AverageTicketScreenProps = {
  filters: AverageTicketFilters;
  onFiltersChange: (filters: AverageTicketFilters) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: AverageTicketScreenServices;
};

type WeekRow = AverageTicketBody["weeks"][number];

const NO_WEEKS: WeekRow[] = [];

const NO_FIGURE = "—";

function averageTicketText(averageTicket: number | null): string {
  return averageTicket === null ? NO_FIGURE : formatCents(averageTicket);
}

function changeText(changeTenths: number | null): string {
  return changeTenths === null ? NO_FIGURE : formatSignedTenthsOfPercent(changeTenths);
}

const weekColumns = [
  dataColumn({
    id: "week",
    header: "Semana",
    sort: {
      order: (a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0),
      firstDirection: "descending",
    },
    render: (row: WeekRow) => reportPeriodText(row),
  }),
  dataColumn({
    id: "sales",
    header: "Ventas",
    align: "end",
    sort: { order: (a, b) => a.sales_count - b.sales_count, firstDirection: "descending" },
    render: (row: WeekRow) => formatNumber(row.sales_count),
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    sort: { order: (a, b) => a.total - b.total, firstDirection: "descending" },
    render: (row: WeekRow) => <TableCellText strong>{formatCents(row.total)}</TableCellText>,
  }),
  dataColumn({
    id: "averageTicket",
    header: "Ticket promedio",
    align: "end",
    sort: {
      order: (a, b) => (a.average_ticket ?? 0) - (b.average_ticket ?? 0),
      firstDirection: "descending",
    },
    render: (row: WeekRow) => averageTicketText(row.average_ticket),
  }),
] as const;

export function AverageTicketScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: AverageTicketScreenProps) {
  const registerChosen = filters.register !== "ALL";
  const data = useAverageTicketQuery({
    query: reportQueryOf(filters),
    fetchAverageTicket: services.fetchAverageTicket,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown === undefined || shown.current.sales_count === 0 ? NO_WEEKS : shown.weeks,
    id: (row) => row.from,
    columns: weekColumns,
    sort: { column: filters.sortBy, direction: filters.sort },
    onSortChange: ({ column, direction }) =>
      onFiltersChange({ ...filters, sortBy: column, sort: direction }),
  });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Ventas" title="Ticket promedio" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.range}
          registerFilter={registerFilter}
        />
      </div>
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          {shown ? (
            <>
              <Card>
                <FigureStat
                  size="heading"
                  label="Ticket promedio"
                  value={averageTicketText(shown.current.average_ticket)}
                  detail={plural(shown.current.sales_count, {
                    one: "1 venta",
                    other: `${formatNumber(shown.current.sales_count)} ventas`,
                  })}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Período anterior"
                  value={averageTicketText(shown.previous.average_ticket)}
                  detail={reportPeriodText(shown.previous_range)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Diferencia"
                  value={changeText(shown.change_tenths)}
                />
              </Card>
            </>
          ) : (
            <>
              <Card>
                <FigureStat size="heading" label="Ticket promedio" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Período anterior" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Diferencia" loading />
              </Card>
            </>
          )}
        </div>
      )}
      <Table
        aria-label="Ticket promedio por semana"
        table={table}
        {...cloudTableState(data, "el reporte del ticket promedio")}
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
