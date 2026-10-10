export const RECEIPT_RETRY_DELAY_MS = 10_000;

export type PrinterStatus = "ready" | "cover_open" | "paper_out" | "not_responding";

export interface ReceiptPrintObservation {
  acknowledged: boolean;
  failed: boolean;
  status: PrinterStatus | null;
  readySince: Date | null;
}

export type ReceiptPrintStanding =
  | "printing"
  | "printed"
  | "cover_open"
  | "paper_out"
  | "not_responding"
  | "retry_offered"
  | "failed";

export function startedReceiptPrint(): ReceiptPrintObservation {
  return { acknowledged: false, failed: false, status: null, readySince: null };
}

export function observePrinterStatus(
  observation: ReceiptPrintObservation,
  status: PrinterStatus,
  at: Date,
): ReceiptPrintObservation {
  return {
    ...observation,
    status,
    readySince: observation.status === "ready" ? observation.readySince : at,
  };
}

export function observePrintAcknowledged(
  observation: ReceiptPrintObservation,
): ReceiptPrintObservation {
  return { ...observation, acknowledged: true };
}

export function observePrintFailed(observation: ReceiptPrintObservation): ReceiptPrintObservation {
  return { ...observation, failed: true };
}

export function receiptPrintStanding(
  { acknowledged, failed, status, readySince }: ReceiptPrintObservation,
  now: Date,
): ReceiptPrintStanding {
  if (acknowledged) {
    return "printed";
  }
  if (failed) {
    return "failed";
  }
  if (status === null) {
    return "printing";
  }
  if (status !== "ready") {
    return status;
  }
  return readySince !== null && now.getTime() - readySince.getTime() >= RECEIPT_RETRY_DELAY_MS
    ? "retry_offered"
    : "printing";
}

export function mayStartReceiptPrint(
  observation: ReceiptPrintObservation | undefined,
  now: Date,
): boolean {
  if (observation === undefined) {
    return true;
  }
  const standing = receiptPrintStanding(observation, now);
  return standing === "printed" || standing === "retry_offered" || standing === "failed";
}

export function mayRetryReceiptPrint(standing: ReceiptPrintStanding | null): boolean {
  return standing === "retry_offered";
}
