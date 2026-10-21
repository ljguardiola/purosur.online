import { isValidCuit } from "./cuit.js";
import {
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
} from "./factura-c-fiscal-block.js";
import type { DocumentTypeReportState } from "./fortnight-report.js";
import type { Fortnight } from "./offline-authorization-code.js";

const CUIT_DOCUMENT_TYPE = 80;
const CUIT_DIGITS = 11;
const CUIT_PREFIX_END = 2;
const CUIT_BODY_END = 10;

export interface OfflineDocumentCorrection {
  issuedOn?: string;
  total?: number;
  buyerDocumentType?: number;
  buyerDocumentNumber?: number;
  buyerTaxStatusCode?: number;
}

export type RejectedDocumentRemedy =
  | { kind: "report" }
  | { kind: "printed"; correction: OfflineDocumentCorrection };

export type CorrectedField = keyof OfflineDocumentCorrection;

const CORRECTED_FIELDS: readonly CorrectedField[] = [
  "issuedOn",
  "total",
  "buyerDocumentType",
  "buyerDocumentNumber",
  "buyerTaxStatusCode",
];

export type DocumentFieldChange = {
  [Field in CorrectedField]: {
    field: Field;
    before: NonNullable<OfflineDocumentCorrection[Field]>;
    after: NonNullable<OfflineDocumentCorrection[Field]>;
  };
}[CorrectedField];

export type OfflineDocumentCorrectionRefusal =
  | "nothing_changed"
  | "date_outside_fortnight"
  | "date_out_of_order"
  | "invalid_total"
  | "invalid_buyer_identification";

interface PresentedValues {
  number: number;
  issuedOn: string;
  total: number;
  netAmount: number;
  buyerDocumentType: number;
  buyerDocumentNumber: number;
  buyerTaxStatusCode: number;
}

interface CorrectableDocument extends PresentedValues {
  correction: OfflineDocumentCorrection | null;
}

export interface PresentableOfflineDocument extends CorrectableDocument {
  id: string;
}

export interface RejectedDocumentRejection {
  state: DocumentTypeReportState;
  rejectedNumber: number | null;
  lastAttemptAt: Date | null;
}

export interface RecordedRemedy {
  number: number;
  recordedAt: Date;
}

export interface RejectedDocumentCreditNote {
  saleId: string;
  reason: "rejected_document";
  pointOfSale: number;
  associatedVoucher: { voucherType: number; pointOfSale: number; number: number };
  total: number;
  receiverTaxStatusCode: number;
}

export function presentedOfflineDocument<TDocument extends CorrectableDocument>(
  document: TDocument,
): TDocument {
  const { correction } = document;
  if (correction === null) {
    return document;
  }
  const presented = { ...document };
  for (const field of CORRECTED_FIELDS) {
    const value = correction[field];
    if (value !== undefined) {
      Object.assign(presented, { [field]: value });
    }
  }
  if (correction.total !== undefined) {
    presented.netAmount = correction.total;
  }
  return presented;
}

export function correctionChanges(
  current: PresentedValues,
  correction: OfflineDocumentCorrection,
): DocumentFieldChange[] {
  const changes: DocumentFieldChange[] = [];
  for (const field of CORRECTED_FIELDS) {
    const after = correction[field];
    if (after !== undefined && after !== current[field]) {
      changes.push({ field, before: current[field], after } as DocumentFieldChange);
    }
  }
  return changes;
}

export function correctionAfter(
  previous: OfflineDocumentCorrection | null,
  changes: readonly DocumentFieldChange[],
): OfflineDocumentCorrection {
  const correction: OfflineDocumentCorrection = { ...previous };
  for (const change of changes) {
    Object.assign(correction, { [change.field]: change.after });
  }
  return correction;
}

function isBuyerIdentified(documentType: number, documentNumber: number): boolean {
  if (documentType === FINAL_CONSUMER_DOCUMENT_TYPE) {
    return documentNumber === FINAL_CONSUMER_DOCUMENT_NUMBER;
  }
  if (documentType === CUIT_DOCUMENT_TYPE) {
    const digits = String(documentNumber).padStart(CUIT_DIGITS, "0");
    return isValidCuit(
      [
        digits.slice(0, CUIT_PREFIX_END),
        digits.slice(CUIT_PREFIX_END, CUIT_BODY_END),
        digits.slice(CUIT_BODY_END),
      ].join("-"),
    );
  }
  return false;
}

function isBuyerCorrection(correction: OfflineDocumentCorrection): boolean {
  return (
    correction.buyerDocumentType !== undefined ||
    correction.buyerDocumentNumber !== undefined ||
    correction.buyerTaxStatusCode !== undefined
  );
}

function isPositiveWhole(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isOutOfOrder(
  issuedOn: string,
  document: PresentedValues,
  documents: readonly PresentedValues[],
): boolean {
  const before = documents.filter(({ number }) => number < document.number);
  const after = documents.filter(({ number }) => number > document.number);
  const previous = before.reduce<PresentedValues | undefined>(
    (nearest, candidate) =>
      nearest === undefined || candidate.number > nearest.number ? candidate : nearest,
    undefined,
  );
  const next = after.reduce<PresentedValues | undefined>(
    (nearest, candidate) =>
      nearest === undefined || candidate.number < nearest.number ? candidate : nearest,
    undefined,
  );
  return (
    (previous !== undefined && issuedOn < previous.issuedOn) ||
    (next !== undefined && issuedOn > next.issuedOn)
  );
}

export function offlineDocumentCorrectionRefusal({
  document,
  documents,
  correction,
  fortnight,
}: {
  document: PresentedValues;
  documents: readonly PresentedValues[];
  correction: OfflineDocumentCorrection;
  fortnight: Fortnight;
}): OfflineDocumentCorrectionRefusal | null {
  if (correctionChanges(document, correction).length === 0) {
    return "nothing_changed";
  }
  const { issuedOn, total, buyerDocumentType, buyerDocumentNumber, buyerTaxStatusCode } = {
    ...document,
    ...definedFields(correction),
  };
  if (issuedOn < fortnight.start || issuedOn > fortnight.end) {
    return "date_outside_fortnight";
  }
  if (isOutOfOrder(issuedOn, document, documents)) {
    return "date_out_of_order";
  }
  if (!isPositiveWhole(total)) {
    return "invalid_total";
  }
  if (
    isBuyerCorrection(correction) &&
    (!isBuyerIdentified(buyerDocumentType, buyerDocumentNumber) ||
      !isPositiveWhole(buyerTaxStatusCode))
  ) {
    return "invalid_buyer_identification";
  }
  return null;
}

function definedFields(correction: OfflineDocumentCorrection): OfflineDocumentCorrection {
  return Object.fromEntries(Object.entries(correction).filter(([, value]) => value !== undefined));
}

function isRemediedAfter(
  { rejectedNumber, lastAttemptAt }: RejectedDocumentRejection,
  remedy: RecordedRemedy | null,
): boolean {
  return (
    remedy !== null &&
    remedy.number === rejectedNumber &&
    (lastAttemptAt === null || remedy.recordedAt > lastAttemptAt)
  );
}

function isRejectedDocument({ state, rejectedNumber }: RejectedDocumentRejection): boolean {
  return state === "refused" && rejectedNumber !== null;
}

export function awaitsRemedy(
  rejection: RejectedDocumentRejection,
  remedy: RecordedRemedy | null,
): boolean {
  return isRejectedDocument(rejection) && !isRemediedAfter(rejection, remedy);
}

export function remedyAwaitsResend(
  rejection: RejectedDocumentRejection,
  remedy: RecordedRemedy | null,
): boolean {
  return isRejectedDocument(rejection) && isRemediedAfter(rejection, remedy);
}

export function rejectedDocumentCreditNote({
  document,
  offlinePointOfSale,
  realTimePointOfSale,
  reportedThrough,
}: {
  document: CorrectableDocument & { saleId: string };
  offlinePointOfSale: number;
  realTimePointOfSale: number | null;
  reportedThrough: number;
}): RejectedDocumentCreditNote | null {
  if (
    document.correction === null ||
    realTimePointOfSale === null ||
    document.number > reportedThrough
  ) {
    return null;
  }
  const presented = presentedOfflineDocument(document);
  return {
    saleId: document.saleId,
    reason: "rejected_document",
    pointOfSale: realTimePointOfSale,
    associatedVoucher: {
      voucherType: FACTURA_C_VOUCHER_TYPE,
      pointOfSale: offlinePointOfSale,
      number: document.number,
    },
    total: presented.total,
    receiverTaxStatusCode: presented.buyerTaxStatusCode,
  };
}
