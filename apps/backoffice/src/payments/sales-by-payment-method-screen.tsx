import type { SalesByPaymentMethodBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  PercentBar,
  Table,
  TableCellText,
  Toggle,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { Receipt } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { paymentMethodLabel } from "../platform/payment-method-label";
import { shareOfTotal } from "../platform/share-of-total";
import { RegisterReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { ReportFilters } from "../shell/report-filters";
import { reportQueryOf } from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { REPORT_VIEW_TITLES } from "../shell/reports-tabs";
import { HandConfirmedPaymentsSection } from "./hand-confirmed-payments-section";
import { useSalesByPaymentMethodQuery } from "./payments-queries";
import type { SalesByPaymentMethodFilters } from "./sales-by-payment-method-filters";
import type { SalesByPaymentMethodScreenServices } from "./sales-by-payment-method-services";
import { salesByPaymentMethodSpreadsheet } from "./sales-by-payment-method-spreadsheet";

export type SalesByPaymentMethodScreenProps = {
  filters: SalesByPaymentMethodFilters;
  onFiltersChange: (filters: SalesByPaymentMethodFilters) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: SalesByPaymentMethodScreenServices;
};

type SalesOfMethod = SalesByPaymentMethodBody["methods"][number];

const SCREEN_TITLE = REPORT_VIEW_TITLES["sales-by-payment-method"];

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
      render: (sales: SalesOfMethod) => <PercentBar value={shareOfTotal(sales.amount, total)} />,
    }),
  ] as const;
}

export function SalesByPaymentMethodScreen(props: SalesByPaymentMethodScreenProps) {
  const { filters, onFiltersChange, onSessionEnded, registerFilter, services } = props;
  const handConfirmedToggle = (
    <Toggle
      name="handConfirmed"
      checked={filters.handConfirmed}
      onCheckedChange={(handConfirmed) => onFiltersChange({ ...filters, handConfirmed })}
    >
      Confirmados a mano
    </Toggle>
  );
  return (
    <>
      {filters.handConfirmed ? (
        <HandConfirmedPaymentsSection
          filters={filters}
          onFiltersChange={(next) => onFiltersChange({ ...filters, ...next })}
          onSessionEnded={onSessionEnded}
          registerFilter={registerFilter}
          services={services}
          extraFilter={handConfirmedToggle}
        />
      ) : (
        <SalesByMethodSection {...props} handConfirmedToggle={handConfirmedToggle} />
      )}
    </>
  );
}

function SalesByMethodSection({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
  handConfirmedToggle,
}: SalesByPaymentMethodScreenProps & { handConfirmedToggle: ReactNode }) {
  const registerChosen = filters.register !== "ALL";
  const [registerLabel, setRegisterLabel] = useState<string>();
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
    <>
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
                  ? salesByPaymentMethodSpreadsheet(
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
        {handConfirmedToggle}
      </div>
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          {shown ? (
            <>
              <Card>
                <FigureStat
                  size="heading"
                  label="Total vendido"
                  value={formatCents(shown.totals.total)}
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
    </>
  );
}
