import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { ContingencyTicketRescueModal } from "./contingency-ticket-rescue-modal";
import { defaultContingencyTicketRescueModalServices } from "./contingency-ticket-rescue-modal-services";

const route = getRouteApi("/signed-in/fiscal-area/fiscal/caea");

export function ContingencyTicketRescueAssistant({
  onClose,
}: {
  onClose: () => void;
}): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  return (
    <ContingencyTicketRescueModal
      onClose={onClose}
      onSessionEnded={sessionActions.sessionEnded}
      services={
        services.contingencyTicketRescueModal ?? defaultContingencyTicketRescueModalServices
      }
    />
  );
}
