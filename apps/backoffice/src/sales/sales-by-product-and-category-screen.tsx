import type { SalesByProductAndCategoryBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  formatPercent,
  ListFilter,
  PercentBar,
  plural,
  Table,
  TableCellText,
  TablePagination,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { Receipt } from "lucide-react";
import { useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { shareOfTotal } from "../platform/share-of-total";
import { RegisterReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { ReportFilters } from "../shell/report-filters";
import { reportQueryOf } from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { REPORT_VIEW_TITLES } from "../shell/reports-tabs";
import type { SalesByProductAndCategoryFilters } from "./sales-by-product-and-category-filters";
import type { SalesByProductAndCategoryScreenServices } from "./sales-by-product-and-category-services";
import { salesByProductAndCategorySpreadsheet } from "./sales-by-product-and-category-spreadsheet";
import { useSalesByProductAndCategoryQuery } from "./sales-queries";
import { soldQuantityText } from "./sold-quantity-text";
import { soldRowLabel } from "./sold-row-label";

export type SalesByProductAndCategoryScreenProps = {
  filters: SalesByProductAndCategoryFilters;
  onFiltersChange: (filters: SalesByProductAndCategoryFilters) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: SalesByProductAndCategoryScreenServices;
};

type SoldRow = SalesByProductAndCategoryBody["rows"][number];

const NO_ROWS: SoldRow[] = [];

const GROUP_OPTIONS = [
  { value: "category" as const, label: "Por categoría" },
  { value: "product" as const, label: "Por producto" },
] as const;

const SCREEN_TITLE = REPORT_VIEW_TITLES["sales-by-product-and-category"];

const labelOrder = textOrder(soldRowLabel);

function soldColumns(group: SalesByProductAndCategoryBody["group"], total: number) {
  return [
    dataColumn({
      id: "name",
      header: group === "product" ? "Producto" : "Categoría",
      sort: { order: labelOrder, firstDirection: "ascending" },
      render: (row: SoldRow) => soldRowLabel(row),
    }),
    dataColumn({
      id: "units",
      header: "Cantidad",
      align: "end",
      render: (row: SoldRow) => soldQuantityText(row),
    }),
    dataColumn({
      id: "amount",
      header: "Importe",
      align: "end",
      sort: { order: (a, b) => a.amount - b.amount, firstDirection: "descending" },
      render: (row: SoldRow) => <TableCellText strong>{formatCents(row.amount)}</TableCellText>,
    }),
    dataColumn({
      id: "share",
      header: "Parte del total",
      render: (row: SoldRow) => <PercentBar value={shareOfTotal(row.amount, total)} />,
    }),
  ] as const;
}

function topRowDetail(row: SoldRow, total: number): string {
  return `${formatPercent(Math.round(shareOfTotal(row.amount, total) * 100))} del importe`;
}

export function SalesByProductAndCategoryScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: SalesByProductAndCategoryScreenProps) {
  const registerChosen = filters.register !== "ALL";
  const [registerLabel, setRegisterLabel] = useState<string>();
  const [page, setPage] = useState(1);
  const data = useSalesByProductAndCategoryQuery({
    query: { ...reportQueryOf(filters), group: filters.group },
    fetchSalesByProductAndCategory: services.fetchSalesByProductAndCategory,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const group = shown?.group ?? filters.group;
  const table = useTableModel({
    items: shown?.rows ?? NO_ROWS,
    id: (row) => row.id ?? "none",
    columns: soldColumns(group, shown?.totals.amount ?? 0),
    sort: { column: filters.sortBy, direction: filters.sort },
    onSortChange: ({ column, direction }) =>
      onFiltersChange({ ...filters, sortBy: column, sort: direction }),
    paging: { page, onPageChange: setPage },
  });
  const rowCount = table.getRowCount();
  const topRow = shown?.rows[0];

  function changeFilters(next: SalesByProductAndCategoryFilters) {
    setPage(1);
    onFiltersChange(next);
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={changeFilters}
          answeredPeriod={shown?.range}
          registerFilter={registerFilter}
          onRegisterLabelChange={setRegisterLabel}
          trailing={
            <RegisterReportDownload
              dataStatus={data.status}
              registerLabel={registerLabel}
              workbook={(registerLabel) =>
                shown
                  ? salesByProductAndCategorySpreadsheet(
                      shown,
                      table.getPrePaginatedRowModel().rows.map((row) => row.original),
                      registerLabel,
                    )
                  : null
              }
              fileName={shown ? reportFileName(SCREEN_TITLE, shown.range) : ""}
            />
          }
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
        <div className="grid grid-cols-3 gap-4">
          {shown ? (
            <>
              <Card>
                <FigureStat
                  size="heading"
                  label="Total vendido"
                  value={formatCents(shown.totals.amount)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Cantidad"
                  value={soldQuantityText(shown.totals)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label={group === "product" ? "Producto principal" : "Categoría principal"}
                  value={topRow === undefined ? "—" : soldRowLabel(topRow)}
                  {...(topRow === undefined
                    ? {}
                    : { detail: topRowDetail(topRow, shown.totals.amount) })}
                />
              </Card>
            </>
          ) : (
            <>
              <Card>
                <FigureStat size="heading" label="Total vendido" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Cantidad" loading />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label={group === "product" ? "Producto principal" : "Categoría principal"}
                  loading
                />
              </Card>
            </>
          )}
        </div>
      )}
      <Table
        aria-label="Ventas por producto y por categoría"
        table={table}
        {...cloudTableState(data, "el reporte de ventas por producto y por categoría")}
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
    </>
  );
}
