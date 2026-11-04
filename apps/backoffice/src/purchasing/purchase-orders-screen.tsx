import type { PurchaseOrderSummary } from "@purosur/contracts";
import {
  actionsColumn,
  dataColumn,
  formatNumber,
  ListFilter,
  plural,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { ClipboardList, Eye, Search } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import { formatPurchaseOrderCreatedDay } from "./purchase-order-day";
import { purchaseOrderStatusOf } from "./purchase-order-status";
import type { PurchaseOrdersFilters } from "./purchase-orders-filters";
import type { PurchaseOrdersScreenServices } from "./purchase-orders-services";
import { usePurchaseOrdersQuery } from "./purchasing-queries";
import { ExpectedTotalAmount } from "./purchasing-screen-parts";

export type PurchaseOrdersScreenProps = {
  filters: PurchaseOrdersFilters;
  onFiltersChange: (filters: PurchaseOrdersFilters) => void;
  onOpenOrder: (orderId: string) => void;
  onSessionEnded: () => void;
  services: PurchaseOrdersScreenServices;
};

type StateFilter = PurchaseOrdersFilters["state"];

const NO_ORDERS: PurchaseOrderSummary[] = [];

const STATE_FILTER_OPTIONS = [
  { value: "ALL" as const, label: "Todos" },
  { value: "DRAFT" as const, label: "Borradores" },
  { value: "SENT" as const, label: "Enviados" },
  { value: "PARTIALLY_RECEIVED" as const, label: "Recibidos en parte" },
  { value: "RECEIVED" as const, label: "Recibidos" },
  { value: "CANCELLED" as const, label: "Cancelados" },
] as const;

export function PurchaseOrdersScreen({
  filters,
  onFiltersChange,
  onOpenOrder,
  onSessionEnded,
  services,
}: PurchaseOrdersScreenProps) {
  const [stateFilter, setStateFilter] = useState<StateFilter>(filters.state);
  const data = usePurchaseOrdersQuery({
    state: stateFilter,
    fetchPurchaseOrders: services.fetchPurchaseOrders,
    onSessionEnded,
  });
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: PurchaseOrdersFilters = { state: stateFilter };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [stateFilter, filters]);

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
          onPress: () => onOpenOrder(order.id),
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
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Pedidos" title="Pedidos de compra" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ListFilter
          name="state"
          label="Estado:"
          options={STATE_FILTER_OPTIONS}
          value={stateFilter}
          onChange={setStateFilter}
        />
      </div>
      <Table
        aria-label="Pedidos de compra"
        table={table}
        {...cloudTableState(data, "los pedidos")}
        empty={
          stateFilter === "ALL"
            ? {
                icon: <ClipboardList />,
                title: "Todavía no hay pedidos",
                variant: "blank",
              }
            : {
                icon: <Search />,
                title: "Sin resultados",
                description: "Probá con otro estado.",
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
    </ScreenLayout>
  );
}
