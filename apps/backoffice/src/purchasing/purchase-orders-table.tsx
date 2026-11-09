import type { PurchaseOrderSummary } from "@purosur/contracts";
import {
  actionsColumn,
  dataColumn,
  formatNumber,
  plural,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { ClipboardList, Eye, Search } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatPurchaseOrderCreatedDay } from "./purchase-order-day";
import { purchaseOrderStatusOf } from "./purchase-order-status";
import type { PurchaseOrdersFilters } from "./purchase-orders-filters";
import type { PurchaseOrdersScreenServices } from "./purchase-orders-services";
import { usePurchaseOrdersQuery } from "./purchasing-queries";
import { ExpectedTotalAmount } from "./purchasing-screen-parts";

export type PurchaseOrdersTableProps = {
  state: Exclude<PurchaseOrdersFilters["state"], "PENDING_RECEIPT">;
  supplierId: string | undefined;
  openOrder: string | undefined;
  onOpenOrderChange: (orderId: string | undefined) => void;
  onSessionEnded: () => void;
  services: PurchaseOrdersScreenServices;
};

const NO_ORDERS: PurchaseOrderSummary[] = [];

export function PurchaseOrdersTable({
  state,
  supplierId,
  openOrder,
  onOpenOrderChange,
  onSessionEnded,
  services,
}: PurchaseOrdersTableProps) {
  const data = usePurchaseOrdersQuery({
    state,
    supplierId,
    fetchPurchaseOrders: services.fetchPurchaseOrders,
    onSessionEnded,
  });
  const orders = data.status === "loaded" ? data.value : NO_ORDERS;

  const columns = [
    dataColumn({
      id: "supplier",
      header: "Proveedor",
      render: (order: PurchaseOrderSummary) => order.supplier.name,
    }),
    dataColumn({
      id: "createdAt",
      header: "Fecha de creación",
      render: (order: PurchaseOrderSummary) => formatPurchaseOrderCreatedDay(order.createdAt),
    }),
    dataColumn({
      id: "lines",
      header: "Líneas",
      align: "end",
      render: (order: PurchaseOrderSummary) => formatNumber(order.lineCount),
    }),
    dataColumn({
      id: "expectedTotal",
      header: "Total esperado",
      align: "end",
      render: (order: PurchaseOrderSummary) => (
        <ExpectedTotalAmount
          cents={order.expectedTotalCents}
          hasUnpricedLine={order.hasUnpricedLine}
        />
      ),
    }),
    dataColumn({
      id: "state",
      header: "Estado",
      render: (order: PurchaseOrderSummary) => {
        const status = purchaseOrderStatusOf(order.state);
        return <StatusIndicator tone={status.tone}>{status.label}</StatusIndicator>;
      },
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (order: PurchaseOrderSummary) => ({
          icon: <Eye />,
          "aria-label": `Abrir el pedido de ${order.supplier.name}`,
          onPress: () => onOpenOrderChange(order.id),
        }),
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: orders,
    id: (order) => order.id,
    columns,
  });
  const shownCount = table.getRowModel().rows.length;

  return (
    <Table
      aria-label="Pedidos de compra"
      table={table}
      onRowPress={(order) => onOpenOrderChange(order.id)}
      rowState={(order) => (order.id === openOrder ? "selected" : undefined)}
      {...cloudTableState(data, "los pedidos")}
      empty={
        state === "ALL" && supplierId === undefined
          ? {
              icon: <ClipboardList />,
              title: "Todavía no hay pedidos",
              variant: "blank",
            }
          : {
              icon: <Search />,
              title: "Sin resultados",
              description:
                supplierId === undefined
                  ? "Probá con otro estado."
                  : "Probá con otro estado o proveedor.",
              variant: "filtered",
            }
      }
      footer={
        shownCount === 0 ? undefined : (
          <p className="text-text-subtle text-detail">
            {plural(shownCount, {
              one: "1 pedido",
              other: `${formatNumber(shownCount)} pedidos`,
            })}
          </p>
        )
      }
    />
  );
}
