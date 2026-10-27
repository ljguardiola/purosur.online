import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { IssuedFiscalDocumentsScreen } from "./issued-fiscal-documents-screen";
import { defaultIssuedFiscalDocumentsScreenServices } from "./issued-fiscal-documents-services";

const route = getRouteApi("/signed-in/cash-and-fiscal-area/fiscal-documents");

export function IssuedFiscalDocumentsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  const screenServices =
    services.issuedFiscalDocumentsScreen ?? defaultIssuedFiscalDocumentsScreenServices;
  useDocumentTitle("Comprobantes · Puro Sur");
  return (
    <IssuedFiscalDocumentsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: { fetchReportRegisters: screenServices.fetchFiscalRegisters },
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={screenServices}
    />
  );
}
