import { getRouteApi, useRouterState } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { purchaseRegisteredIn } from "./purchase-registered-state";
import { PurchasesListScreen } from "./purchases-list-screen";

const route = getRouteApi("/signed-in/stock-area/purchases");

export function PurchasesListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const navigate = route.useNavigate();
  const registered = useRouterState({
    select: (state) => purchaseRegisteredIn(state.location.state),
  });
  useDocumentTitle("Compras · Puro Sur");
  return (
    <PurchasesListScreen
      registered={registered}
      onNoticeDismissed={() => void navigate({ replace: true, state: {} })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.purchasesListScreen}
    />
  );
}
