import type { MarginReportBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  InlineNotice,
  ListFilter,
  plural,
  Table,
  TableCellText,
  TablePagination,
  Tag,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { Receipt, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { categoryPathText } from "../platform/category-path";
import { cloudTableState } from "../platform/cloud-table-state";
import { ReportFilters } from "../shell/report-filters";
import { reportQueryOf } from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { MarginReportFilters } from "./margin-report-filters";
import type { MarginReportScreenServices } from "./margin-report-services";
import { useMarginReportQuery } from "./stock-queries";

export type MarginReportScreenProps = {
  filters: MarginReportFilters;
  onFiltersChange: (filters: MarginReportFilters) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: MarginReportScreenServices;
};

type MarginRow = MarginReportBody["rows"][number];

const NO_ROWS: MarginRow[] = [];

const GROUP_OPTIONS = [
  { value: "category" as const, label: "Por categoría" },
  { value: "product" as const, label: "Por producto" },
] as const;

const NO_CATEGORY = "Sin categoría";

function rowLabel(row: MarginRow): string {
  return row.id === null && row.path.length === 0
    ? NO_CATEGORY
    : formatProductDescription({
        name: categoryPathText(row.path),
        brandName: row.brandName,
        netContent: row.netContent,
      });
}

const labelOrder = textOrder(rowLabel);

function incompleteSalesText(sales: number): string {
  return plural(sales, {
    one: "Costo incompleto · 1 venta",
    other: `Costo incompleto · ${formatNumber(sales)} ventas`,
  });
}

function marginColumns(group: MarginReportBody["group"]) {
  return [
    dataColumn({
      id: "name",
      header: group === "product" ? "Producto" : "Categoría",
      sort: { order: labelOrder, firstDirection: "ascending" },
      render: (row: MarginRow) => rowLabel(row),
    }),
    dataColumn({
      id: "amount",
      header: "Vendido",
      align: "end",
      sort: { order: (a, b) => a.amount - b.amount, firstDirection: "descending" },
      render: (row: MarginRow) => formatCents(row.amount),
    }),
    dataColumn({
      id: "cost",
      header: "Costo",
      align: "end",
      render: (row: MarginRow) => (
        <div className="flex flex-col items-end gap-1">
          {formatCents(row.cost)}
          {row.incompleteSales > 0 ? (
            <Tag tone="warning">{incompleteSalesText(row.incompleteSales)}</Tag>
          ) : null}
        </div>
      ),
    }),
    dataColumn({
      id: "margin",
      header: "Margen",
      align: "end",
      sort: { order: (a, b) => a.margin - b.margin, firstDirection: "descending" },
      render: (row: MarginRow) => <TableCellText strong>{formatCents(row.margin)}</TableCellText>,
    }),
  ] as const;
}

export function MarginReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: MarginReportScreenProps) {
  const registerChosen = filters.register !== "ALL";
  const [page, setPage] = useState(1);
  const data = useMarginReportQuery({
    query: { ...reportQueryOf(filters), group: filters.group },
    fetchMarginReport: services.fetchMarginReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const group = shown?.group ?? filters.group;
  const table = useTableModel({
    items: shown?.rows ?? NO_ROWS,
    id: (row) => row.id ?? "none",
    columns: marginColumns(group),
    sort: { column: filters.sortBy, direction: filters.sort },
    onSortChange: ({ column, direction }) =>
      onFiltersChange({ ...filters, sortBy: column, sort: direction }),
    paging: { page, onPageChange: setPage },
  });
  const rowCount = table.getRowCount();

  function changeFilters(next: MarginReportFilters) {
    setPage(1);
    onFiltersChange(next);
  }

  return (
    <ScreenLayout
      topBar={
        <ScreenTopBar
          eyebrow="Reportes · Rentabilidad"
          title="Margen por producto y por categoría"
        />
      }
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={changeFilters}
          answeredPeriod={shown?.range}
          registerFilter={registerFilter}
        />
        <ListFilter
          name="group"
          label="Agrupar:"
          options={GROUP_OPTIONS}
          value={filters.group}
          onChange={(next) => changeFilters({ ...filters, group: next })}
        />
      </div>
      {data.status === "failed" ? null : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              {shown ? (
                <FigureStat
                  size="heading"
                  label="Vendido"
                  value={formatCents(shown.totals.amount)}
                />
              ) : (
                <FigureStat size="heading" label="Vendido" loading />
              )}
            </Card>
            <Card>
              {shown ? (
                <FigureStat size="heading" label="Costo" value={formatCents(shown.totals.cost)} />
              ) : (
                <FigureStat size="heading" label="Costo" loading />
              )}
            </Card>
            <Card>
              {shown ? (
                <FigureStat
                  size="heading"
                  label="Margen"
                  value={formatCents(shown.totals.margin)}
                />
              ) : (
                <FigureStat size="heading" label="Margen" loading />
              )}
            </Card>
          </div>
          {shown && shown.totals.incompleteSales > 0 ? (
            <InlineNotice
              tone="warning"
              icon={<TriangleAlert />}
              title={plural(shown.totals.incompleteSales, {
                one: "1 venta tiene el costo incompleto",
                other: `${formatNumber(shown.totals.incompleteSales)} ventas tienen el costo incompleto`,
              })}
              description="El margen incluye esas ventas con el costo conocido solamente."
            />
          ) : null}
        </>
      )}
      <Table
        aria-label="Margen por producto y por categoría"
        table={table}
        {...cloudTableState(data, "el reporte de margen por producto y por categoría")}
        empty={{
          icon: <Receipt />,
          title: registerChosen
            ? "No hay ventas de esta caja en este período"
            : "No hay ventas en este período",
          variant: registerChosen ? "filtered" : "blank",
        }}
        footer={
          rowCount === 0 ? undefined : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-text-subtle text-detail">
                {group === "product"
                  ? plural(rowCount, {
                      one: "1 producto",
                      other: `${formatNumber(rowCount)} productos`,
                    })
                  : plural(rowCount, {
                      one: "1 categoría",
                      other: `${formatNumber(rowCount)} categorías`,
                    })}
              </p>
              <TablePagination
                table={table}
                label={group === "product" ? "Páginas de productos" : "Páginas de categorías"}
              />
            </div>
          )
        }
      />
    </ScreenLayout>
  );
}
