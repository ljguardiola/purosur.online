import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { ContingencyTicketRescueScreen } from "./contingency-ticket-rescue-screen";
import { defaultContingencyTicketRescueScreenServices } from "./contingency-ticket-rescue-services";

const route = getRouteApi("/signed-in/settings-area/contingency-ticket-rescue");

export function ContingencyTicketRescuePage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Rescate de tickets · Puro Sur");
  return (
    <ContingencyTicketRescueScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.contingencyTicketRescueScreen ?? defaultContingencyTicketRescueScreenServices}
    />
  );
}
