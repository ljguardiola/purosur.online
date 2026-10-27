import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { SupplierPriceComparisonScreen } from "./supplier-price-comparison-screen";
import { defaultSupplierPriceComparisonScreenServices } from "./supplier-price-comparison-services";

const route = getRouteApi("/signed-in/orders-area/price-comparison");

export function SupplierPriceComparisonPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Comparación de precios · Puro Sur");
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
