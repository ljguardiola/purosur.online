import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { SalesByProductAndCategoryScreen } from "./sales-by-product-and-category-screen";
import { defaultSalesByProductAndCategoryScreenServices } from "./sales-by-product-and-category-services";

const route = getRouteApi("/signed-in/reports-area/reports/sales-by-product-and-category");

export function SalesByProductAndCategoryPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Ventas por producto y por categoría · Puro Sur");
  return (
    <SalesByProductAndCategoryScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={
        services.salesByProductAndCategoryScreen ?? defaultSalesByProductAndCategoryScreenServices
      }
    />
  );
}
