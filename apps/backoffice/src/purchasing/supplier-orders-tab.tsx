import type { PurchaseOrderSummary } from "@purosur/contracts";
import { ButtonLink, dataColumn, StatusIndicator, Table, useTableModel } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatPurchaseOrderCreatedDay } from "./purchase-order-day";
import { purchaseOrderStatusOf } from "./purchase-order-status";
import { usePurchaseOrdersQuery } from "./purchasing-queries";
import { ExpectedTotalAmount } from "./purchasing-screen-parts";
import type { SupplierPanelServices } from "./supplier-panel-services";

const AllOrdersLink = createLink(ButtonLink);

const NO_ORDERS: PurchaseOrderSummary[] = [];

const columns = [
  dataColumn({
    id: "createdAt",
    header: "Fecha de creación",
    render: (order: PurchaseOrderSummary) => formatPurchaseOrderCreatedDay(order.createdAt),
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
] as const;

export type SupplierOrdersTabProps = {
  supplierId: string;
  services: Pick<SupplierPanelServices, "fetchPurchaseOrders">;
  onSessionEnded: () => void;
};

export function SupplierOrdersTab({
  supplierId,
  services,
  onSessionEnded,
}: SupplierOrdersTabProps) {
  const data = usePurchaseOrdersQuery({
    state: "ALL",
    supplierId,
    fetchPurchaseOrders: services.fetchPurchaseOrders,
    onSessionEnded,
  });
  const table = useTableModel({
    items: data.status === "loaded" ? data.value : NO_ORDERS,
    id: (order) => order.id,
    columns,
  });
  return (
    <div className="flex flex-col gap-3">
      <Table
        aria-label="Pedidos del proveedor"
        variant="nested"
        table={table}
        {...cloudTableState(data, "los pedidos")}
        empty={{ icon: <ClipboardList />, title: "Sin pedidos", variant: "blank" }}
      />
      <div>
        <AllOrdersLink variant="text" to="/purchase-orders" search={{ supplier: supplierId }}>
          Ver todos
        </AllOrdersLink>
      </div>
    </div>
  );
}
