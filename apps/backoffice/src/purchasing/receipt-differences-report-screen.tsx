import type { ReceiptDifferencesBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCalendarDayNumeric,
  formatNumber,
  formatSaleUnitQuantity,
  formatSignedCents,
  Table,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { PackageMinus } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { AreaTopBar } from "../shell/area-top-bar";
import { ReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { ReportFilters } from "../shell/report-filters";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import { ScreenLayout } from "../shell/screen-layout";
import { useReceiptDifferencesReportQuery } from "./purchasing-queries";
import type { ReceiptDifferencesReportScreenServices } from "./receipt-differences-report-services";
import { receiptDifferencesReportSpreadsheet } from "./receipt-differences-report-spreadsheet";
import { reportMonthText } from "./report-month-text";

export type ReceiptDifferencesReportScreenProps = {
  filters: ReportPeriodFilters;
  onFiltersChange: (filters: ReportPeriodFilters) => void;
  onSessionEnded: () => void;
  services: ReceiptDifferencesReportScreenServices;
};

const SCREEN_TITLE = "Diferencias de recepción";

const NO_PRICE_DIFFERENCE = "—";

type Quantities = {
  received: number;
  missing: number;
  saleUnit: "UNIT" | "KG";
};

type DifferenceRow = {
  id: string;
  parentId: string | null;
  label: string;
  quantities: Quantities | null;
  priceDifferenceCents: number | null;
};

const NO_ROWS: DifferenceRow[] = [];

const differenceColumns = [
  dataColumn({
    id: "label",
    header: "Proveedor, mes y producto",
    render: (row: DifferenceRow) => row.label,
  }),
  dataColumn({
    id: "received",
    header: "Recibido",
    align: "end",
    render: (row: DifferenceRow) =>
      row.quantities && formatSaleUnitQuantity(row.quantities.received, row.quantities.saleUnit),
  }),
  dataColumn({
    id: "missing",
    header: "Faltante",
    align: "end",
    render: (row: DifferenceRow) =>
      row.quantities && formatSaleUnitQuantity(row.quantities.missing, row.quantities.saleUnit),
  }),
  dataColumn({
    id: "priceDifference",
    header: "Diferencia de precio",
    align: "end",
    render: (row: DifferenceRow) =>
      row.priceDifferenceCents === null
        ? NO_PRICE_DIFFERENCE
        : formatSignedCents(row.priceDifferenceCents),
  }),
] as const;

function rowsOf(report: ReceiptDifferencesBody | undefined): DifferenceRow[] {
  if (report === undefined) {
    return NO_ROWS;
  }
  return report.suppliers.flatMap((supplier) => [
    {
      id: supplier.supplier_id,
      parentId: null,
      label: supplier.name,
      quantities: null,
      priceDifferenceCents: supplier.price_difference_cents,
    },
    ...supplier.months.flatMap((month) => {
      const monthId = `${supplier.supplier_id}:${month.month}`;
      return [
        {
          id: monthId,
          parentId: supplier.supplier_id,
          label: reportMonthText(month.month),
          quantities: null,
          priceDifferenceCents: month.price_difference_cents,
        },
        ...month.lines.map((line) => ({
          id: `${monthId}:${line.receipt_id}:${line.product.id}`,
          parentId: monthId,
          label: `${formatProductDescription(line.product)} · ${formatCalendarDayNumeric(line.received_on)}`,
          quantities: {
            received: line.received_quantity,
            missing: line.missing_quantity,
            saleUnit: line.product.saleUnit,
          },
          priceDifferenceCents: line.price_difference_cents,
        })),
      ];
    }),
  ]);
}

export function ReceiptDifferencesReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: ReceiptDifferencesReportScreenProps) {
  const data = useReceiptDifferencesReportQuery({
    query: filters.from === "" ? {} : { from: filters.from, to: filters.to },
    fetchReceiptDifferencesReport: services.fetchReceiptDifferencesReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: rowsOf(shown),
    id: (row) => row.id,
    parentId: (row) => row.parentId,
    columns: differenceColumns,
  });
  const cards = [
    { label: "Líneas con faltante", value: shown && formatNumber(shown.totals.short_lines) },
    {
      label: "Líneas con diferencia de precio",
      value: shown && formatNumber(shown.totals.price_difference_lines),
    },
    {
      label: "Diferencia de precio neta",
      value: shown && formatSignedCents(shown.totals.price_difference_cents),
    },
  ];

  return (
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Reportes · Compras" title={SCREEN_TITLE} />}
      bodyClassName="gap-4 p-6"
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        answeredPeriod={shown?.range}
        trailing={
          <ReportDownload
            dataStatus={data.status}
            workbook={() => (shown ? receiptDifferencesReportSpreadsheet(shown) : null)}
            fileName={shown ? reportFileName(SCREEN_TITLE, shown.range) : ""}
          />
        }
      />
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
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
        aria-label={SCREEN_TITLE}
        table={table}
        {...cloudTableState(data, "las diferencias de recepción")}
        empty={{
          icon: <PackageMinus />,
          title: "No hay diferencias de recepción en este período",
          variant: filters.from === "" ? "blank" : "filtered",
        }}
      />
    </ScreenLayout>
  );
}
