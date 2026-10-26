import type { ComponentType } from "react";
import { fetchContingencyTicketRecoveries } from "./contingency-ticket-recovery-api";
import { rescueContingencyBackupTicket } from "./contingency-ticket-rescue-api";
import type { FinishTicketRecoveryModalServices } from "./finish-ticket-recovery-modal";
import { QrCameraScanner, type QrScannerProps } from "./qr-camera-scanner";

export type ContingencyTicketRescueScreenServices = {
  rescueContingencyBackupTicket: typeof rescueContingencyBackupTicket;
  fetchContingencyTicketRecoveries?: typeof fetchContingencyTicketRecoveries;
  finishTicketRecoveryModal?: FinishTicketRecoveryModalServices;
  scanner: ComponentType<QrScannerProps>;
};

export const defaultContingencyTicketRescueScreenServices: ContingencyTicketRescueScreenServices = {
  rescueContingencyBackupTicket,
  fetchContingencyTicketRecoveries,
  scanner: QrCameraScanner,
};
