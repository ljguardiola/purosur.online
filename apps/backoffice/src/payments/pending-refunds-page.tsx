import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { PendingRefundsScreen } from "./pending-refunds-screen";

const route = getRouteApi("/signed-in/cash-and-fiscal-area/pending-refunds");

export function PendingRefundsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Reembolsos pendientes · Puro Sur");
  return (
    <PendingRefundsScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.pendingRefundsScreen}
    />
  );
}
