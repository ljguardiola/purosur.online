import type { SalesByCashierBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  plural,
  Table,
  TableCellText,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { Receipt } from "lucide-react";
import { useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { RegisterReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { ReportFilters } from "../shell/report-filters";
import { reportQueryOf } from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { SalesByCashierFilters } from "./sales-by-cashier-filters";
import type { SalesByCashierScreenServices } from "./sales-by-cashier-services";
import { salesByCashierSpreadsheet } from "./sales-by-cashier-spreadsheet";
import { useSalesByCashierQuery } from "./sales-queries";

export type SalesByCashierScreenProps = {
  filters: SalesByCashierFilters;
  onFiltersChange: (filters: SalesByCashierFilters) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: SalesByCashierScreenServices;
};

type CashierRow = SalesByCashierBody["rows"][number];

const NO_ROWS: CashierRow[] = [];

const SCREEN_TITLE = "Ventas por cajero";

const UNIDENTIFIED = "Sin identificar";
const NO_FIGURE = "—";

function cashierName(row: CashierRow): string {
  return row.name ?? UNIDENTIFIED;
}

function averageTicketText(averageTicket: number | null): string {
  return averageTicket === null ? NO_FIGURE : formatCents(averageTicket);
}

const cashierColumns = [
  dataColumn({
    id: "name",
    header: "Cajero",
    sort: { order: textOrder(cashierName), firstDirection: "ascending" },
    render: (row: CashierRow) => cashierName(row),
  }),
  dataColumn({
    id: "sessions",
    header: "Sesiones",
    align: "end",
    sort: { order: (a, b) => a.sessions - b.sessions, firstDirection: "descending" },
    render: (row: CashierRow) => formatNumber(row.sessions),
  }),
  dataColumn({
    id: "sales",
    header: "Ventas",
    align: "end",
    sort: { order: (a, b) => a.sales_count - b.sales_count, firstDirection: "descending" },
    render: (row: CashierRow) => formatNumber(row.sales_count),
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    sort: { order: (a, b) => a.total - b.total, firstDirection: "descending" },
    render: (row: CashierRow) => <TableCellText strong>{formatCents(row.total)}</TableCellText>,
  }),
  dataColumn({
    id: "averageTicket",
    header: "Ticket promedio",
    align: "end",
    sort: {
      order: (a, b) => (a.average_ticket ?? 0) - (b.average_ticket ?? 0),
      firstDirection: "descending",
    },
    render: (row: CashierRow) => averageTicketText(row.average_ticket),
  }),
] as const;

export function SalesByCashierScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: SalesByCashierScreenProps) {
  const registerChosen = filters.register !== "ALL";
  const [registerLabel, setRegisterLabel] = useState<string>();
  const data = useSalesByCashierQuery({
    query: reportQueryOf(filters),
    fetchSalesByCashier: services.fetchSalesByCashier,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.rows ?? NO_ROWS,
    id: (row) => row.cashier_id,
    columns: cashierColumns,
    sort: { column: filters.sortBy, direction: filters.sort },
    onSortChange: ({ column, direction }) =>
      onFiltersChange({ ...filters, sortBy: column, sort: direction }),
  });
  const topRow = shown?.rows[0];

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Ventas" title={SCREEN_TITLE} />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.range}
          registerFilter={registerFilter}
          onRegisterLabelChange={setRegisterLabel}
          trailing={
            <RegisterReportDownload
              dataStatus={data.status}
              registerLabel={registerLabel}
              workbook={(registerLabel) =>
                shown
                  ? salesByCashierSpreadsheet(
                      shown,
                      table.getRowModel().rows.map((row) => row.original),
                      registerLabel,
                    )
                  : null
              }
              fileName={shown ? reportFileName(SCREEN_TITLE, shown.range) : ""}
            />
          }
        />
      </div>
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          {shown ? (
            <>
              <Card>
                <FigureStat
                  size="heading"
                  label="Cajeros con ventas"
                  value={formatNumber(shown.totals.cashiers)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Más ventas"
                  value={topRow === undefined ? NO_FIGURE : cashierName(topRow)}
                  {...(topRow === undefined
                    ? {}
                    : {
                        detail: plural(topRow.sales_count, {
                          one: "1 venta",
                          other: `${formatNumber(topRow.sales_count)} ventas`,
                        }),
                      })}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Ticket promedio"
                  value={averageTicketText(shown.totals.average_ticket)}
                />
              </Card>
            </>
          ) : (
            <>
              <Card>
                <FigureStat size="heading" label="Cajeros con ventas" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Más ventas" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Ticket promedio" loading />
              </Card>
            </>
          )}
        </div>
      )}
      <Table
        aria-label="Ventas por cajero"
        table={table}
        {...cloudTableState(data, "el reporte de ventas por cajero")}
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
