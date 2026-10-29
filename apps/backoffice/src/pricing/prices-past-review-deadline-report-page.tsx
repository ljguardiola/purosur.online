import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { PricesPastReviewDeadlineReportScreen } from "./prices-past-review-deadline-report-screen";
import { defaultPricesPastReviewDeadlineReportScreenServices } from "./prices-past-review-deadline-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/prices-past-review-deadline");

export function PricesPastReviewDeadlineReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Precios sin revisar · Puro Sur");
  return (
    <PricesPastReviewDeadlineReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={
        services.pricesPastReviewDeadlineReportScreen ??
        defaultPricesPastReviewDeadlineReportScreenServices
      }
    />
  );
}
