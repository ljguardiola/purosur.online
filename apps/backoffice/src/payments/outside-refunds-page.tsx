import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { OutsideRefundsScreen } from "./outside-refunds-screen";
import { defaultRefundsScreenServices } from "./refunds-services";

const route = getRouteApi("/signed-in/cash-and-fiscal-area/refunds/outside-the-system");

export function OutsideRefundsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Reembolsos sin API · Puro Sur");
  return (
    <OutsideRefundsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.refundsScreens ?? defaultRefundsScreenServices}
    />
  );
}
