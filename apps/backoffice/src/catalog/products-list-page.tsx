import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { ProductsListScreen } from "./products-list-screen";
import { defaultProductsListScreenServices } from "./products-list-services";

const route = getRouteApi("/signed-in/products-area/products/");

export function ProductsListPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  const { product, tab, ...filters } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <ProductsListScreen
      access={session}
      filters={filters}
      onFiltersChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true })
      }
      productPanelSections={services.productPanelSections}
      openProduct={product}
      tab={tab}
      onPanelChange={(panel) =>
        void navigate({
          search: (previous) => ({ ...previous, product: panel?.product, tab: panel?.tab }),
          ...(panel === undefined ? { replace: true } : {}),
        })
      }
      onSessionEnded={sessionActions.sessionEnded}
      services={services.productsListScreen ?? defaultProductsListScreenServices}
    />
  );
}
