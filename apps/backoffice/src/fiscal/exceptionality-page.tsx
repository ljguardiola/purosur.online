import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { ExceptionalityScreen } from "./exceptionality-screen";
import { defaultExceptionalityScreenServices } from "./exceptionality-services";

const route = getRouteApi("/signed-in/cash-and-fiscal-area/exceptionality");

export function ExceptionalityPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Excepcionalidad · Puro Sur");
  return (
    <ExceptionalityScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.exceptionalityScreen ?? defaultExceptionalityScreenServices}
    />
  );
}
