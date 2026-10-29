import type { PurchasesBySupplierBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  Table,
  useTableModel,
} from "@purosur/ui";
import { ShoppingCart } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ReportFilters } from "../shell/report-filters";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { PurchasesReportFilters } from "./purchases-report-filters";
import { purchasesReportMonthText } from "./purchases-report-month-text";
import type { PurchasesReportScreenServices } from "./purchases-report-services";
import { usePurchasesReportQuery } from "./purchasing-queries";

export type PurchasesReportScreenProps = {
  filters: PurchasesReportFilters;
  onFiltersChange: (filters: PurchasesReportFilters) => void;
  onSessionEnded: () => void;
  services: PurchasesReportScreenServices;
};

type PurchasesRow = {
  id: string;
  parentId: string | null;
  label: string;
  purchases: number;
  amount: number;
};

const NO_ROWS: PurchasesRow[] = [];

const purchasesColumns = [
  dataColumn({
    id: "label",
    header: "Proveedor y mes",
    render: (row: PurchasesRow) => row.label,
  }),
  dataColumn({
    id: "purchases",
    header: "Compras",
    align: "end",
    render: (row: PurchasesRow) => formatNumber(row.purchases),
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    render: (row: PurchasesRow) => formatCents(row.amount),
  }),
] as const;

function rowsOf(report: PurchasesBySupplierBody | undefined): PurchasesRow[] {
  if (report === undefined) {
    return NO_ROWS;
  }
  return report.suppliers.flatMap((supplier) => [
    {
      id: supplier.supplier_id,
      parentId: null,
      label: supplier.name,
      purchases: supplier.purchases,
      amount: supplier.amount,
    },
    ...supplier.months.map((month) => ({
      id: `${supplier.supplier_id}:${month.month}`,
      parentId: supplier.supplier_id,
      label: purchasesReportMonthText(month.month),
      purchases: month.purchases,
      amount: month.amount,
    })),
  ]);
}

export function PurchasesReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: PurchasesReportScreenProps) {
  const data = usePurchasesReportQuery({
    query: filters.from === "" ? {} : { from: filters.from, to: filters.to },
    fetchPurchasesReport: services.fetchPurchasesReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: rowsOf(shown),
    id: (row) => row.id,
    parentId: (row) => row.parentId,
    columns: purchasesColumns,
  });
  const cards = [
    { label: "Total comprado", value: shown && formatCents(shown.totals.amount) },
    { label: "Compras", value: shown && formatNumber(shown.totals.purchases) },
    { label: "Proveedores", value: shown && formatNumber(shown.totals.suppliers) },
  ];

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Compras" title="Compras por proveedor" />}
      bodyClassName="gap-4 p-6"
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        answeredPeriod={shown?.range}
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
        aria-label="Compras por proveedor"
        table={table}
        {...cloudTableState(data, "las compras por proveedor")}
        empty={{
          icon: <ShoppingCart />,
          title: "No hay compras en este período",
          variant: filters.from === "" ? "blank" : "filtered",
        }}
      />
    </ScreenLayout>
  );
}
