import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { SupplierPriceComparisonScreen } from "./supplier-price-comparison-screen";
import { defaultSupplierPriceComparisonScreenServices } from "./supplier-price-comparison-services";

const route = getRouteApi("/signed-in/purchasing-area/purchase-orders/comparison");

export function SupplierPriceComparisonPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <SupplierPriceComparisonScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={
        services.supplierPriceComparisonScreen ?? defaultSupplierPriceComparisonScreenServices
      }
    />
  );
}
