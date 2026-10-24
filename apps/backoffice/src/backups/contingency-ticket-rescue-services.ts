import type { ComponentType } from "react";
import { rescueContingencyBackupTicket } from "./contingency-ticket-rescue-api";
import { QrCameraScanner, type QrScannerProps } from "./qr-camera-scanner";

export type ContingencyTicketRescueScreenServices = {
  rescueContingencyBackupTicket: typeof rescueContingencyBackupTicket;
  scanner: ComponentType<QrScannerProps>;
};

export const defaultContingencyTicketRescueScreenServices: ContingencyTicketRescueScreenServices =
  {
    rescueContingencyBackupTicket,
    scanner: QrCameraScanner,
  };
