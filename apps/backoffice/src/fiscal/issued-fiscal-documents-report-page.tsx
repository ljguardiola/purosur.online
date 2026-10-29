import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { IssuedFiscalDocumentsReportScreen } from "./issued-fiscal-documents-report-screen";
import { defaultIssuedFiscalDocumentsReportScreenServices } from "./issued-fiscal-documents-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/fiscal-documents");

export function IssuedFiscalDocumentsReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Comprobantes emitidos · Puro Sur");
  return (
    <IssuedFiscalDocumentsReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={
        services.issuedFiscalDocumentsReportScreen ??
        defaultIssuedFiscalDocumentsReportScreenServices
      }
    />
  );
}
