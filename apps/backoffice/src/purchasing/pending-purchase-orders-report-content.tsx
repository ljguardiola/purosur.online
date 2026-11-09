import type { PendingPurchaseOrdersBody } from "@purosur/contracts";
import {
  actionsColumn,
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Eye, PackageOpen } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { ReportFilters } from "../shell/report-filters";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import type { PendingPurchaseOrdersReportScreenServices } from "./pending-purchase-orders-report-services";
import { pendingPurchaseOrdersReportSpreadsheet } from "./pending-purchase-orders-report-spreadsheet";
import { formatPurchaseOrderSentDay } from "./purchase-order-day";
import { purchaseOrderStatusOf } from "./purchase-order-status";
import { usePendingPurchaseOrdersReportQuery } from "./purchasing-queries";
import { ExpectedTotalAmount } from "./purchasing-screen-parts";

export type PendingPurchaseOrdersReportContentProps = {
  filters: ReportPeriodFilters;
  onFiltersChange: (filters: ReportPeriodFilters) => void;
  onOpenOrder: ((orderId: string) => void) | undefined;
  onSessionEnded: () => void;
  services: PendingPurchaseOrdersReportScreenServices;
};

export const PENDING_PURCHASE_ORDERS_REPORT_TITLE = "Pedidos pendientes de recibir";

type PendingOrder = PendingPurchaseOrdersBody["orders"][number];

const NO_ORDERS: PendingOrder[] = [];

export function PendingPurchaseOrdersReportContent({
  filters,
  onFiltersChange,
  onOpenOrder,
  onSessionEnded,
  services,
}: PendingPurchaseOrdersReportContentProps) {
  const data = usePendingPurchaseOrdersReportQuery({
    query: filters.from === "" ? {} : { from: filters.from, to: filters.to },
    fetchPendingPurchaseOrdersReport: services.fetchPendingPurchaseOrdersReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const dataColumns = [
    dataColumn({
      id: "supplier",
      header: "Proveedor",
      render: (order: PendingOrder) => order.supplier.name,
    }),
    dataColumn({
      id: "sentAt",
      header: "Enviado el",
      render: (order: PendingOrder) => formatPurchaseOrderSentDay(order.sent_at),
    }),
    dataColumn({
      id: "state",
      header: "Estado",
      render: (order: PendingOrder) => {
        const status = purchaseOrderStatusOf(order.state);
        return <StatusIndicator tone={status.tone}>{status.label}</StatusIndicator>;
      },
    }),
    dataColumn({
      id: "lines",
      header: "Productos",
      align: "end",
      render: (order: PendingOrder) => formatNumber(order.line_count),
    }),
    dataColumn({
      id: "expectedTotal",
      header: "Importe esperado",
      align: "end",
      render: (order: PendingOrder) => (
        <ExpectedTotalAmount
          cents={order.expected_total_cents}
          hasUnpricedLine={order.has_unpriced_line}
        />
      ),
    }),
  ] as const;
  const openOrderColumn = actionsColumn({
    id: "actions",
    header: "Acciones",
    actions: [
      (order: PendingOrder) => ({
        icon: <Eye />,
        "aria-label": `Abrir el pedido de ${order.supplier.name}`,
        onPress: () => onOpenOrder?.(order.id),
      }),
    ],
  });
  const columns = onOpenOrder ? ([...dataColumns, openOrderColumn] as const) : dataColumns;
  const table = useTableModel({
    items: shown?.orders ?? NO_ORDERS,
    id: (order) => order.id,
    columns,
  });
  const cards = [
    { label: "Pedidos pendientes", value: shown && formatNumber(shown.totals.orders) },
    { label: "Proveedores", value: shown && formatNumber(shown.totals.suppliers) },
    {
      label: "Importe esperado",
      value: shown && formatCents(shown.totals.expected_total_cents),
      detail: shown?.totals.has_unpriced_line ? "Hay líneas sin precio de lista" : undefined,
    },
  ];

  return (
    <>
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        answeredPeriod={shown?.range}
        trailing={
          <ReportDownload
            dataStatus={data.status}
            workbook={() => (shown ? pendingPurchaseOrdersReportSpreadsheet(shown) : null)}
            fileName={
              shown ? reportFileName(PENDING_PURCHASE_ORDERS_REPORT_TITLE, shown.range) : ""
            }
          />
        }
      />
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          {cards.map(({ label, value, detail }) => (
            <Card key={label}>
              {value === undefined ? (
                <FigureStat size="heading" label={label} loading />
              ) : (
                <FigureStat size="heading" label={label} value={value} detail={detail} />
              )}
            </Card>
          ))}
        </div>
      )}
      <Table
        aria-label={PENDING_PURCHASE_ORDERS_REPORT_TITLE}
        table={table}
        {...cloudTableState(data, "los pedidos pendientes de recibir")}
        empty={{
          icon: <PackageOpen />,
          title: "No hay pedidos pendientes de recibir en este período",
          variant: filters.from === "" ? "blank" : "filtered",
        }}
      />
    </>
  );
}
