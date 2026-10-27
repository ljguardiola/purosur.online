import type { ExpiringLotsReportBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCalendarDayNumeric,
  formatNumber,
  formatSignedCents,
  plural,
  Table,
  TableCellText,
  Tag,
  useTableModel,
} from "@purosur/ui";
import { CalendarClock } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatStockQuantity } from "../platform/stock-quantity";
import { ReportFilters } from "../shell/report-filters";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { ExpiringLotsReportFilters } from "./expiring-lots-report-filters";
import type { ExpiringLotsReportScreenServices } from "./expiring-lots-report-services";
import { formatStockValue } from "./stock-cost";
import { useExpiringLotsReportQuery } from "./stock-queries";

export type ExpiringLotsReportScreenProps = {
  filters: ExpiringLotsReportFilters;
  onFiltersChange: (filters: ExpiringLotsReportFilters) => void;
  onSessionEnded: () => void;
  services: ExpiringLotsReportScreenServices;
};

type Lot = ExpiringLotsReportBody["lots"][number];

const NO_LOTS: Lot[] = [];

function lotsText(count: number): string {
  return plural(count, { one: "1 lote", other: `${count} lotes` });
}

function windowText(windowDays: number): string {
  return `Ventana de aviso de la sucursal: ${plural(windowDays, { one: "1 día", other: `${windowDays} días` })}`;
}

function SummaryCards({ report }: { report: ExpiringLotsReportBody | undefined }) {
  if (report === undefined) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {["Lotes", "Valor al costo", "Sin costo"].map((label) => (
          <Card key={label}>
            <FigureStat size="heading" label={label} loading />
          </Card>
        ))}
      </div>
    );
  }
  const { summary } = report;
  return (
    <div className="grid grid-cols-3 gap-4">
      <Card>
        <FigureStat size="heading" label="Lotes" value={lotsText(summary.lot_count)} />
      </Card>
      <Card>
        <FigureStat
          size="heading"
          label="Valor al costo"
          value={formatSignedCents(summary.value_cents)}
        />
      </Card>
      <Card>
        <FigureStat size="heading" label="Sin costo" value={lotsText(summary.without_cost_count)} />
        {summary.without_cost_count === 0 ? null : <Tag tone="warning">No suman al valor</Tag>}
      </Card>
    </div>
  );
}

const columns = [
  dataColumn({
    id: "product",
    header: "Producto",
    render: (lot: Lot) => <TableCellText>{lot.product.name}</TableCellText>,
  }),
  dataColumn({
    id: "category",
    header: "Categoría",
    render: (lot: Lot) => <TableCellText tone="subtle">{lot.product.category_name}</TableCellText>,
  }),
  dataColumn({
    id: "lot",
    width: 140,
    header: "Lote",
    render: (lot: Lot) =>
      lot.lot_number === null ? (
        <TableCellText tone="subtle">—</TableCellText>
      ) : (
        <TableCellText strong monospace>
          {lot.lot_number}
        </TableCellText>
      ),
  }),
  dataColumn({
    id: "expiresOn",
    width: 130,
    header: "Vence",
    render: (lot: Lot) => <TableCellText>{formatCalendarDayNumeric(lot.expires_on)}</TableCellText>,
  }),
  dataColumn({
    id: "days",
    width: 90,
    header: "Días",
    align: "end",
    render: (lot: Lot) => (
      <TableCellText tone={lot.expired ? "error" : undefined}>
        {formatNumber(lot.days_to_expiry)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "remaining",
    width: 160,
    header: "Cantidad",
    align: "end",
    render: (lot: Lot) => (
      <TableCellText strong>
        {formatStockQuantity(lot.remaining, lot.product.sale_unit)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "value",
    width: 160,
    header: "Valor",
    align: "end",
    render: (lot: Lot) => (
      <TableCellText strong tone={lot.value_cents === null ? "subtle" : undefined}>
        {formatStockValue(lot.value_cents)}
      </TableCellText>
    ),
  }),
] as const;

export function ExpiringLotsReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: ExpiringLotsReportScreenProps) {
  const data = useExpiringLotsReportQuery({
    query: filters.from === "" ? {} : { from: filters.from, to: filters.to },
    fetchExpiringLotsReport: services.fetchExpiringLotsReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.lots ?? NO_LOTS,
    id: (lot) => lot.id,
    columns,
  });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Stock" title="Lotes por vencer" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.period}
        />
      </div>
      {data.status === "failed" || shown === undefined ? null : (
        <p className="text-detail text-text-subtle">{windowText(shown.window_days)}</p>
      )}
      {data.status === "failed" ? null : (
        <SummaryCards report={data.status === "loaded" ? data.value : undefined} />
      )}
      <Table
        aria-label="Lotes por vencer"
        table={table}
        {...cloudTableState(data, "los lotes por vencer")}
        empty={{
          icon: <CalendarClock />,
          title: "No hay lotes que venzan en este período",
          variant: filters.from === "" ? "blank" : "filtered",
        }}
      />
    </ScreenLayout>
  );
}
