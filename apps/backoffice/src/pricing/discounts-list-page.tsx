import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { DiscountsListScreen } from "./discounts-list-screen";

const route = getRouteApi("/signed-in/catalog/discounts");

export function DiscountsListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Promociones · Puro Sur");
  return (
    <DiscountsListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.discountsListScreen}
    />
  );
}
