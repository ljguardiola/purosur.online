import { getRouteApi, useRouterState } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { purchaseOrderReceivedIn } from "./purchase-order-received-state";
import { PurchaseOrdersScreen } from "./purchase-orders-screen";
import { defaultPurchaseOrdersScreenServices } from "./purchase-orders-services";

const route = getRouteApi("/signed-in/purchasing-area/purchase-orders/");

export function PurchaseOrdersListPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { supplier, order, ...filters } = route.useSearch();
  const navigate = route.useNavigate();
  const received = useRouterState({
    select: (state) => purchaseOrderReceivedIn(state.location.state),
  });
  return (
    <PurchaseOrdersScreen
      access={session}
      filters={filters}
      onFiltersChange={(next) =>
        void navigate({ search: (current) => ({ ...current, ...next }), replace: true })
      }
      openOrder={order}
      received={received}
      onOpenOrderChange={(opened) =>
        void navigate({
          search: (current) => ({ ...current, order: opened }),
          ...(opened === undefined ? { replace: true } : {}),
        })
      }
      onReceive={(orderId) =>
        void navigate({ to: "/purchase-orders/$orderId/receive", params: { orderId } })
      }
      onOpenPurchases={() => void navigate({ to: "/purchases" })}
      onReceivedNoticeDismissed={() => void navigate({ replace: true, state: {} })}
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
