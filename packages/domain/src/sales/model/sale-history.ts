import {
  type FiscalAuthorization,
  type FiscalDocumentState,
  type FiscalDocumentType,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
} from "../../fiscal/index.js";

export const SALES_HISTORY_PAGE_SIZE = 50;

export const SALE_STANDINGS = ["completed", "in_progress", "deferred", "voided"] as const;

export type SaleStanding = (typeof SALE_STANDINGS)[number];

export interface SaleFiscalDocument {
  state: FiscalDocumentState;
  documentType: FiscalDocumentType;
  authorization: FiscalAuthorization;
  pointOfSale: number;
  number: number;
}

export interface DeferredSaleRecord {
  satisfied: boolean;
}

export const PENDING_DEFERRED_SALE_RECORD = {
  satisfied: false,
} as const satisfies DeferredSaleRecord;

export function isDeferralPending(record: DeferredSaleRecord | null): boolean {
  return record !== null && record.satisfied === PENDING_DEFERRED_SALE_RECORD.satisfied;
}

export interface SaleFiscalFacts {
  deferred: boolean;
  fiscalDocument: SaleFiscalDocument | null;
}

export type SaleComprobante =
  | {
      kind: "fiscal";
      documentType: FiscalDocumentType;
      authorization: FiscalAuthorization;
      pointOfSale: number;
      number: number;
    }
  | { kind: "deferred_non_fiscal" }
  | { kind: "none" };

export function saleFiscalDocumentAmong(
  attempts: readonly SaleFiscalDocument[],
): SaleFiscalDocument | null {
  return (
    attempts.find(({ state }) => state === "AUTHORIZED") ??
    attempts.find(({ state }) => IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(state)) ??
    null
  );
}

export function saleStandingOf({
  voided,
  deferred,
  fiscalDocument,
}: SaleFiscalFacts & { voided: boolean }): SaleStanding {
  if (voided) {
    return "voided";
  }
  if (deferred) {
    return "deferred";
  }
  return fiscalDocument !== null &&
    IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(fiscalDocument.state)
    ? "in_progress"
    : "completed";
}

export interface SaleDocumentNumber {
  pointOfSale: number | null;
  number: number;
}

export function saleHasDocumentNumber(
  facts: SaleFiscalFacts,
  { pointOfSale, number }: SaleDocumentNumber,
): boolean {
  const comprobante = saleComprobanteOf(facts);
  return (
    comprobante.kind === "fiscal" &&
    comprobante.number === number &&
    (pointOfSale === null || comprobante.pointOfSale === pointOfSale)
  );
}

export function saleComprobanteOf({ deferred, fiscalDocument }: SaleFiscalFacts): SaleComprobante {
  if (fiscalDocument?.state === "AUTHORIZED") {
    const { documentType, authorization, pointOfSale, number } = fiscalDocument;
    return { kind: "fiscal", documentType, authorization, pointOfSale, number };
  }
  return deferred ? { kind: "deferred_non_fiscal" } : { kind: "none" };
}
