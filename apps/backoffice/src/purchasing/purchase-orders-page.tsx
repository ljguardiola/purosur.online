import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { PurchaseOrdersScreen } from "./purchase-orders-screen";
import { defaultPurchaseOrdersScreenServices } from "./purchase-orders-services";

const route = getRouteApi("/signed-in/purchasing-area/purchase-orders");

export function PurchaseOrdersPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const { supplier, ...filters } = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Pedidos de compra · Puro Sur");
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
