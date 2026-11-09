import type { PurchaseOrderSummary } from "@purosur/contracts";
import {
  actionsColumn,
  dataColumn,
  formatNumber,
  ListFilter,
  plural,
  StatusIndicator,
  Table,
  Toggle,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { ClipboardList, Eye, Search } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { PendingPurchaseOrdersReportContent } from "./pending-purchase-orders-report-content";
import { formatPurchaseOrderCreatedDay } from "./purchase-order-day";
import { PurchaseOrderPanel } from "./purchase-order-panel";
import { purchaseOrderStatusOf } from "./purchase-order-status";
import { listsOrders, type PurchaseOrdersFilters } from "./purchase-orders-filters";
import type { PurchaseOrdersListScreenServices } from "./purchase-orders-list-services";
import { usePurchaseOrdersQuery } from "./purchasing-queries";
import {
  ExpectedTotalAmount,
  type SupplierFilter,
  SupplierFilterButton,
} from "./purchasing-screen-parts";
import { ReceiptDifferencesReportContent } from "./receipt-differences-report-content";

export type PurchaseOrdersListScreenProps = {
  filters: PurchaseOrdersFilters;
  onFiltersChange: (filters: PurchaseOrdersFilters) => void;
  access: BackofficeAccess;
  openOrder: string | undefined;
  received: boolean;
  onOpenOrderChange: (orderId: string | undefined) => void;
  onReceive: (orderId: string) => void;
  onOpenPurchases: () => void;
  onReceivedNoticeDismissed: () => void;
  onSessionEnded: () => void;
  services: PurchaseOrdersListScreenServices;
  supplierFilter?: SupplierFilter | undefined;
};

type StateFilter = PurchaseOrdersFilters["state"];

const NO_ORDERS: PurchaseOrderSummary[] = [];

const STATE_FILTER_OPTIONS = [
  { value: "ALL" as const, label: "Todos" },
  { value: "DRAFT" as const, label: "Borradores" },
  { value: "PENDING_RECEIPT" as const, label: "Pendientes de recibir" },
  { value: "SENT" as const, label: "Enviados" },
  { value: "PARTIALLY_RECEIVED" as const, label: "Recibidos en parte" },
  { value: "RECEIVED" as const, label: "Recibidos" },
  { value: "CANCELLED" as const, label: "Cancelados" },
] as const;

export function PurchaseOrdersListScreen({
  filters,
  onFiltersChange,
  access,
  openOrder,
  received,
  onOpenOrderChange,
  onReceive,
  onOpenPurchases,
  onReceivedNoticeDismissed,
  onSessionEnded,
  services,
  supplierFilter,
}: PurchaseOrdersListScreenProps) {
  const [stateFilter, setStateFilter] = useState<StateFilter>(filters.state);
  const [differences, setDifferences] = useState(filters.differences);
  const reportFilters = useEffectEvent(onFiltersChange);
  const period = { from: filters.from, to: filters.to };
  const ordersListed = listsOrders({ state: stateFilter, differences });
  const data = usePurchaseOrdersQuery({
    state: stateFilter === "PENDING_RECEIPT" ? "ALL" : stateFilter,
    supplierId: supplierFilter?.supplierId,
    enabled: ordersListed,
    fetchPurchaseOrders: services.fetchPurchaseOrders,
    onSessionEnded,
  });
  const orders = data.status === "loaded" ? data.value : NO_ORDERS;

  useEffect(() => {
    const shown: PurchaseOrdersFilters = {
      state: stateFilter,
      differences,
      from: filters.from,
      to: filters.to,
    };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [stateFilter, differences, filters]);

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

  function body() {
    if (differences) {
      return (
        <ReceiptDifferencesReportContent
          filters={period}
          onFiltersChange={(next) => onFiltersChange({ state: stateFilter, differences, ...next })}
          onOpenOrder={onOpenOrderChange}
          openOrder={openOrder}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      );
    }
    if (stateFilter === "PENDING_RECEIPT") {
      return (
        <PendingPurchaseOrdersReportContent
          filters={period}
          onFiltersChange={(next) => onFiltersChange({ state: stateFilter, differences, ...next })}
          onOpenOrder={onOpenOrderChange}
          openOrder={openOrder}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      );
    }
    return (
      <Table
        aria-label="Pedidos de compra"
        table={table}
        onRowPress={(order) => onOpenOrderChange(order.id)}
        rowState={(order) => (order.id === openOrder ? "selected" : undefined)}
        {...cloudTableState(data, "los pedidos")}
        empty={
          stateFilter === "ALL" && supplierFilter === undefined
            ? {
                icon: <ClipboardList />,
                title: "Todavía no hay pedidos",
                variant: "blank",
              }
            : {
                icon: <Search />,
                title: "Sin resultados",
                description:
                  supplierFilter === undefined
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

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-6">
        <div className="flex flex-wrap items-center gap-3">
          {differences ? null : (
            <ListFilter
              name="state"
              label="Estado:"
              options={STATE_FILTER_OPTIONS}
              value={stateFilter}
              onChange={setStateFilter}
            />
          )}
          <Toggle name="differences" checked={differences} onCheckedChange={setDifferences}>
            Con diferencias de recepción
          </Toggle>
          {supplierFilter === undefined || !ordersListed ? null : (
            <SupplierFilterButton
              supplierFilter={supplierFilter}
              services={services}
              onSessionEnded={onSessionEnded}
            />
          )}
        </div>
        {body()}
      </div>
      {openOrder === undefined ? null : (
        <PurchaseOrderPanel
          key={openOrder}
          orderId={openOrder}
          access={access}
          received={received}
          services={services}
          onClose={() => onOpenOrderChange(undefined)}
          onReceive={() => onReceive(openOrder)}
          onOpenPurchases={onOpenPurchases}
          onNoticeDismissed={onReceivedNoticeDismissed}
          onSessionEnded={onSessionEnded}
        />
      )}
    </div>
  );
}
