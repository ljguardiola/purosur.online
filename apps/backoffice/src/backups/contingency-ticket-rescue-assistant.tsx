import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import {
  fetchContingencyTicketRecoveries,
  finishContingencyTicketRecovery,
} from "./contingency-ticket-recovery-api";
import { rescueContingencyBackupTicket } from "./contingency-ticket-rescue-api";
import {
  ContingencyTicketRescueModal,
  type ContingencyTicketRescueModalServices,
} from "./contingency-ticket-rescue-modal";
import { QrCameraScanner } from "./qr-camera-scanner";

const route = getRouteApi("/signed-in/fiscal-area/fiscal/caea");

const defaultServices: ContingencyTicketRescueModalServices = {
  rescueContingencyBackupTicket,
  fetchContingencyTicketRecoveries,
  finishTicketRecoveryModal: { finishContingencyTicketRecovery },
  scanner: QrCameraScanner,
};

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
      services={services.contingencyTicketRescueModal ?? defaultServices}
    />
  );
}
