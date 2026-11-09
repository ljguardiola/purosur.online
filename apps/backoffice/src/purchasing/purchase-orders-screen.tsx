import { ListFilter, Toggle } from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState } from "react";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { PendingPurchaseOrdersReportContent } from "./pending-purchase-orders-report-content";
import { PurchaseOrderPanel } from "./purchase-order-panel";
import type { PurchaseOrdersFilters } from "./purchase-orders-filters";
import type { PurchaseOrdersScreenServices } from "./purchase-orders-services";
import { PurchaseOrdersTable } from "./purchase-orders-table";
import { type SupplierFilter, SupplierFilterButton } from "./purchasing-screen-parts";
import { ReceiptDifferencesReportContent } from "./receipt-differences-report-content";

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
  { value: "PENDING_RECEIPT" as const, label: "Pendientes de recibir" },
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
  const [differences, setDifferences] = useState(filters.differences);
  const reportFilters = useEffectEvent(onFiltersChange);
  const period = { from: filters.from, to: filters.to };

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
      <PurchaseOrdersTable
        state={stateFilter}
        supplierId={supplierFilter?.supplierId}
        openOrder={openOrder}
        onOpenOrderChange={onOpenOrderChange}
        onSessionEnded={onSessionEnded}
        services={services}
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
          {supplierFilter === undefined ||
          differences ||
          stateFilter === "PENDING_RECEIPT" ? null : (
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
