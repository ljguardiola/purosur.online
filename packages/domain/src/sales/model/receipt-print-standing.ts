export const RECEIPT_RETRY_DELAY_MS = 10_000;

export type PrinterStatus = "ready" | "cover_open" | "paper_out" | "not_responding";

export interface ReceiptPrintObservation {
  acknowledged: boolean;
  status: PrinterStatus | null;
  readySince: Date | null;
}

export type ReceiptPrintStanding =
  | "printing"
  | "printed"
  | "cover_open"
  | "paper_out"
  | "not_responding"
  | "retry_offered";

export function startedReceiptPrint(): ReceiptPrintObservation {
  return { acknowledged: false, status: null, readySince: null };
}

export function observePrinterStatus(
  observation: ReceiptPrintObservation,
  status: PrinterStatus,
  at: Date,
): ReceiptPrintObservation {
  const keepsBeingReady = status === "ready" && observation.status === "ready";
  return {
    ...observation,
    status,
    readySince: status !== "ready" ? null : keepsBeingReady ? observation.readySince : at,
  };
}

export function observePrintAcknowledged(
  observation: ReceiptPrintObservation,
): ReceiptPrintObservation {
  return { ...observation, acknowledged: true };
}

export function receiptPrintStanding(
  { acknowledged, status, readySince }: ReceiptPrintObservation,
  now: Date,
): ReceiptPrintStanding {
  if (acknowledged) {
    return "printed";
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
  return standing === "printed" || standing === "retry_offered";
}
