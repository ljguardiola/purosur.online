import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { ReceiptDifferencesReportScreen } from "./receipt-differences-report-screen";
import { defaultReceiptDifferencesReportScreenServices } from "./receipt-differences-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/receipt-differences");

export function ReceiptDifferencesReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Diferencias de recepción · Puro Sur");
  return (
    <ReceiptDifferencesReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={
        services.receiptDifferencesReportScreen ?? defaultReceiptDifferencesReportScreenServices
      }
    />
  );
}
