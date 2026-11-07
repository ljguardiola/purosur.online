import type { ComponentType } from "react";
import {
  fetchContingencyTicketRecoveries,
  finishContingencyTicketRecovery,
} from "./contingency-ticket-recovery-api";
import { rescueContingencyBackupTicket } from "./contingency-ticket-rescue-api";
import type { FinishTicketRecoveryModalServices } from "./finish-ticket-recovery-modal";
import { QrCameraScanner, type QrScannerProps } from "./qr-camera-scanner";

export type ContingencyTicketRescueModalServices = {
  rescueContingencyBackupTicket: typeof rescueContingencyBackupTicket;
  fetchContingencyTicketRecoveries: typeof fetchContingencyTicketRecoveries;
  finishTicketRecoveryModal: FinishTicketRecoveryModalServices;
  scanner: ComponentType<QrScannerProps>;
};

export const defaultContingencyTicketRescueModalServices: ContingencyTicketRescueModalServices = {
  rescueContingencyBackupTicket,
  fetchContingencyTicketRecoveries,
  finishTicketRecoveryModal: { finishContingencyTicketRecovery },
  scanner: QrCameraScanner,
};
