import { ListFilter } from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState } from "react";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { PurchaseOrderPanel } from "./purchase-order-panel";
import type { PurchaseOrdersFilters } from "./purchase-orders-filters";
import type { PurchaseOrdersScreenServices } from "./purchase-orders-services";
import { PurchaseOrdersTable } from "./purchase-orders-table";
import { type SupplierFilter, SupplierFilterButton } from "./purchasing-screen-parts";

export type PurchaseOrdersScreenProps = {
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
  services: PurchaseOrdersScreenServices;
  supplierFilter?: SupplierFilter | undefined;
};

type StateFilter = PurchaseOrdersFilters["state"];

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
}: PurchaseOrdersScreenProps) {
  const [stateFilter, setStateFilter] = useState<StateFilter>(filters.state);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: PurchaseOrdersFilters = { state: stateFilter };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [stateFilter, filters]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-6">
        <div className="flex flex-wrap items-center gap-3">
          <ListFilter
            name="state"
            label="Estado:"
            options={STATE_FILTER_OPTIONS}
            value={stateFilter}
            onChange={setStateFilter}
          />
          {supplierFilter === undefined ? null : (
            <SupplierFilterButton
              supplierFilter={supplierFilter}
              services={services}
              onSessionEnded={onSessionEnded}
            />
          )}
        </div>
        <PurchaseOrdersTable
          state={stateFilter}
          supplierId={supplierFilter?.supplierId}
          openOrder={openOrder}
          onOpenOrderChange={onOpenOrderChange}
          onSessionEnded={onSessionEnded}
          services={services}
        />
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
