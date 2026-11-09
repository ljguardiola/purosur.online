import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { PurchaseOrdersScreen } from "./purchase-orders-screen";
import { defaultPurchaseOrdersScreenServices } from "./purchase-orders-services";

const route = getRouteApi("/signed-in/purchasing-area/purchase-orders/");

export function PurchaseOrdersListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const { supplier, ...filters } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <PurchaseOrdersScreen
      filters={filters}
      onFiltersChange={(next) =>
        void navigate({ search: (current) => ({ ...current, ...next }), replace: true })
      }
      onOpenOrder={(orderId) =>
        void navigate({ to: "/purchase-orders/$orderId", params: { orderId } })
      }
      onSessionEnded={sessionActions.sessionEnded}
      services={services.purchaseOrdersScreen ?? defaultPurchaseOrdersScreenServices}
      supplierFilter={
        supplier === undefined
          ? undefined
          : {
              supplierId: supplier,
              onClear: () =>
                void navigate({
                  search: (current) => ({ ...current, supplier: undefined }),
                  replace: true,
                }),
            }
      }
    />
  );
}
