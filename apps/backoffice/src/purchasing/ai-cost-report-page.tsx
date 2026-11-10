import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { AiCostReportScreen } from "./ai-cost-report-screen";
import { defaultAiCostReportScreenServices } from "./ai-cost-report-services";

const route = getRouteApi("/signed-in/settings-area/reports/ai-cost-by-period");

export function AiCostReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Costo de IA · Puro Sur");
  return (
    <AiCostReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.aiCostReportScreen ?? defaultAiCostReportScreenServices}
    />
  );
}
