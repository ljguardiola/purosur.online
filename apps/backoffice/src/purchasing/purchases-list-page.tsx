import { getRouteApi, useRouterState } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { purchaseRegisteredIn } from "./purchase-registered-state";
import { PurchasesListScreen } from "./purchases-list-screen";
import { defaultPurchasesListScreenServices } from "./purchases-list-services";

const route = getRouteApi("/signed-in/purchasing-area/purchases/");

export function PurchasesListPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { supplier, ...filters } = route.useSearch();
  const navigate = route.useNavigate();
  const registered = useRouterState({
    select: (state) => purchaseRegisteredIn(state.location.state),
  });
  return (
    <PurchasesListScreen
      access={session}
      filters={filters}
      onFiltersChange={(next) =>
        void navigate({ search: (current) => ({ ...current, ...next }), replace: true })
      }
      productCreationModal={services.productCreationModal}
      registered={registered}
      onNoticeDismissed={() => void navigate({ replace: true, state: {} })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.purchasesListScreen ?? defaultPurchasesListScreenServices}
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
