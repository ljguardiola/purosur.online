import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { HandTypedWeightsScreen } from "./hand-typed-weights-screen";
import { defaultHandTypedWeightsScreenServices } from "./hand-typed-weights-services";

const route = getRouteApi("/signed-in/reports-area/reports/hand-typed-weights");

export function HandTypedWeightsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Pesos tipeados a mano · Puro Sur");
  return (
    <HandTypedWeightsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.handTypedWeightsScreen ?? defaultHandTypedWeightsScreenServices}
    />
  );
}
