export type PrinterStatus = "ready" | "cover_open" | "paper_out" | "not_responding";

export interface ReceiptPrintObservation {
  sent: boolean;
  failed: boolean;
  printerNotConfigured: boolean;
  status: PrinterStatus | null;
}

export type ReceiptPrintStanding =
  | "printing"
  | "printed"
  | "cover_open"
  | "paper_out"
  | "not_responding"
  | "printer_not_configured"
  | "failed";

export function startedReceiptPrint(): ReceiptPrintObservation {
  return { sent: false, failed: false, printerNotConfigured: false, status: null };
}

export function observePrinterStatus(
  observation: ReceiptPrintObservation,
  status: PrinterStatus,
): ReceiptPrintObservation {
  return { ...observation, status };
}

export function observePrintSent(observation: ReceiptPrintObservation): ReceiptPrintObservation {
  return { ...observation, sent: true };
}

export function observePrintFailed(observation: ReceiptPrintObservation): ReceiptPrintObservation {
  return { ...observation, failed: true };
}

export function observePrinterNotConfigured(
  observation: ReceiptPrintObservation,
): ReceiptPrintObservation {
  return { ...observation, printerNotConfigured: true };
}

export function receiptPrintStanding({
  sent,
  failed,
  printerNotConfigured,
  status,
}: ReceiptPrintObservation): ReceiptPrintStanding {
  if (sent) {
    return "printed";
  }
  if (printerNotConfigured) {
    return "printer_not_configured";
  }
  if (failed) {
    return "failed";
  }
  return status === null || status === "ready" ? "printing" : status;
}

export function mayStartReceiptPrint(observation: ReceiptPrintObservation | undefined): boolean {
  if (observation === undefined) {
    return true;
  }
  const standing = receiptPrintStanding(observation);
  return standing === "printed" || standing === "failed" || standing === "printer_not_configured";
}
