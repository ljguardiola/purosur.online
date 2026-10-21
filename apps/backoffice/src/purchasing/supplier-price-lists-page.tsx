import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { SupplierPriceListsScreen } from "./supplier-price-lists-screen";
import { defaultSupplierPriceListsScreenServices } from "./supplier-price-lists-services";

const route = getRouteApi("/signed-in/orders-area/supplier-price-lists");

export function SupplierPriceListsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Listas de proveedores · Puro Sur");
  return (
    <SupplierPriceListsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onOpenReview={(listId) =>
        void navigate({ to: "/supplier-price-lists/$listId", params: { listId } })
      }
      onSessionEnded={sessionActions.sessionEnded}
      services={services.supplierPriceListsScreen ?? defaultSupplierPriceListsScreenServices}
    />
  );
}
