import type { SalesByPaymentMethodBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  formatPercent,
  ProportionBar,
  Table,
  TableCellText,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { Receipt } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { paymentMethodLabel } from "../platform/payment-method-label";
import { ReportFilters } from "../shell/report-filters";
import { reportQueryOf } from "../shell/report-filters-search";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { paymentMethodShare } from "./payment-method-share";
import { useReportRegistersQuery, useSalesByPaymentMethodQuery } from "./payments-queries";
import type { SalesByPaymentMethodFilters } from "./sales-by-payment-method-filters";
import type { SalesByPaymentMethodScreenServices } from "./sales-by-payment-method-services";

export type SalesByPaymentMethodScreenProps = {
  filters: SalesByPaymentMethodFilters;
  onFiltersChange: (filters: SalesByPaymentMethodFilters) => void;
  onSessionEnded: () => void;
  services: SalesByPaymentMethodScreenServices;
};

type SalesOfMethod = SalesByPaymentMethodBody["methods"][number];

const NO_METHODS: SalesOfMethod[] = [];

const methodOrder = textOrder((sales: SalesOfMethod) => paymentMethodLabel(sales.method));

function paymentColumns(total: number) {
  return [
    dataColumn({
      id: "method",
      header: "Medio de pago",
      sort: { order: methodOrder, firstDirection: "ascending" },
      render: (sales: SalesOfMethod) => paymentMethodLabel(sales.method),
    }),
    dataColumn({
      id: "sales",
      header: "Ventas",
      align: "end",
      sort: { order: (a, b) => a.sales_count - b.sales_count, firstDirection: "descending" },
      render: (sales: SalesOfMethod) => formatNumber(sales.sales_count),
    }),
    dataColumn({
      id: "amount",
      header: "Importe",
      align: "end",
      sort: { order: (a, b) => a.amount - b.amount, firstDirection: "descending" },
      render: (sales: SalesOfMethod) => (
        <TableCellText strong>{formatCents(sales.amount)}</TableCellText>
      ),
    }),
    dataColumn({
      id: "share",
      header: "Parte del total",
      render: (sales: SalesOfMethod) => {
        const share = paymentMethodShare(sales.amount, total);
        return (
          <div className="flex items-center gap-3">
            <ProportionBar value={share} />
            <span className="text-detail text-text-subtle">
              {formatPercent(Math.round(share * 100))}
            </span>
          </div>
        );
      },
    }),
  ] as const;
}

function periodDetail({ from, to }: SalesByPaymentMethodBody["range"]): string {
  return from === to
    ? `El ${formatDisplayDate(from)}`
    : `Del ${formatDisplayDate(from)} al ${formatDisplayDate(to)}`;
}

export function SalesByPaymentMethodScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: SalesByPaymentMethodScreenProps) {
  const registerChosen = filters.register !== "ALL";
  const registers = useReportRegistersQuery({
    fetchReportRegisters: services.fetchReportRegisters,
    onSessionEnded,
  });
  const data = useSalesByPaymentMethodQuery({
    query: reportQueryOf(filters),
    fetchSalesByPaymentMethod: services.fetchSalesByPaymentMethod,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.methods ?? NO_METHODS,
    id: (sales) => sales.method,
    columns: paymentColumns(shown?.totals.total ?? 0),
    sort: { column: filters.sortBy, direction: filters.sort },
    onSortChange: ({ column, direction }) =>
      onFiltersChange({ ...filters, sortBy: column, sort: direction }),
  });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Ventas" title="Ventas por medio de pago" />}
      bodyClassName="gap-4 p-6"
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        registers={registers}
        answeredPeriod={shown?.range}
      />
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          {shown ? (
            <>
              <Card>
                <FigureStat
                  size="heading"
                  label="Total vendido"
                  value={formatCents(shown.totals.total)}
                  detail={periodDetail(shown.range)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Ventas"
                  value={formatNumber(shown.totals.sales_count)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Ticket promedio"
                  value={
                    shown.totals.average_ticket === null
                      ? "—"
                      : formatCents(shown.totals.average_ticket)
                  }
                />
              </Card>
            </>
          ) : (
            <>
              <Card>
                <FigureStat size="heading" label="Total vendido" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Ventas" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Ticket promedio" loading />
              </Card>
            </>
          )}
        </div>
      )}
      <Table
        aria-label="Ventas por medio de pago"
        table={table}
        {...cloudTableState(data, "el reporte de ventas por medio de pago")}
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
