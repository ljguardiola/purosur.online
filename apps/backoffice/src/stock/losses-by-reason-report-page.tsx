import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { LossesByReasonReportScreen } from "./losses-by-reason-report-screen";
import { defaultLossesByReasonReportScreenServices } from "./losses-by-reason-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/losses-by-reason");

export function LossesByReasonReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Mermas por motivo · Puro Sur");
  return (
    <LossesByReasonReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.lossesByReasonReportScreen ?? defaultLossesByReasonReportScreenServices}
    />
  );
}
