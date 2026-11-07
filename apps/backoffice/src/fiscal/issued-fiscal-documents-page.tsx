import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { IssuedFiscalDocumentsScreen } from "./issued-fiscal-documents-screen";
import { defaultIssuedFiscalDocumentsScreenServices } from "./issued-fiscal-documents-services";

const route = getRouteApi("/signed-in/fiscal-area/fiscal/documents");

export function IssuedFiscalDocumentsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const { document: openDocument, ...filters } = route.useSearch();
  const navigate = route.useNavigate();
  const screenServices =
    services.issuedFiscalDocumentsScreen ?? defaultIssuedFiscalDocumentsScreenServices;
  return (
    <IssuedFiscalDocumentsScreen
      filters={filters}
      onFiltersChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true })
      }
      openDocument={openDocument}
      onOpenDocumentChange={(document) =>
        void navigate({ search: (previous) => ({ ...previous, document }), replace: true })
      }
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
