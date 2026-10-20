import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { SalesByPromotionScreen } from "./sales-by-promotion-screen";
import { defaultSalesByPromotionScreenServices } from "./sales-by-promotion-services";

const route = getRouteApi("/signed-in/reports-area/reports/sales-by-promotion");

export function SalesByPromotionPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Descuentos por promoción · Puro Sur");
  return (
    <SalesByPromotionScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.salesByPromotionScreen ?? defaultSalesByPromotionScreenServices}
    />
  );
}
