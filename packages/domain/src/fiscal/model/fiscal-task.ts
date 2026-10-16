import type { FiscalDocumentType, TaxAuthorityRejection } from "./fiscal-rejection-standing.js";

export const CREDIT_NOTE_C_DOCUMENT_TYPE = "credit_note_c";

export type FiscalTaskDocumentType = FiscalDocumentType | typeof CREDIT_NOTE_C_DOCUMENT_TYPE;

export interface ExternalInvoicingVoucher {
  issuedOn: string;
  total: number;
  authorizationCode: string;
}

interface FiscalTaskBase {
  state: "open";
  pointOfSale: number;
  documentType: FiscalTaskDocumentType;
  number: number;
  createdAt: Date;
}

export type FiscalTask =
  | (FiscalTaskBase & { kind: "external_invoicing"; voucher: ExternalInvoicingVoucher })
  | (FiscalTaskBase & {
      kind: "credit_note_rejected";
      creditNoteId: string;
      rejections: readonly TaxAuthorityRejection[];
    });

export type FiscalTaskKind = FiscalTask["kind"];

export function externalInvoicingTask(
  {
    pointOfSale,
    documentType,
    number,
    voucher,
  }: {
    pointOfSale: number;
    documentType: FiscalDocumentType;
    number: number;
    voucher: ExternalInvoicingVoucher;
  },
  createdAt: Date,
): FiscalTask {
  return {
    kind: "external_invoicing",
    state: "open",
    pointOfSale,
    documentType,
    number,
    voucher,
    createdAt,
  };
}

export function creditNoteRejectedTask(
  {
    creditNoteId,
    pointOfSale,
    number,
    rejections,
  }: {
    creditNoteId: string;
    pointOfSale: number;
    number: number;
    rejections: readonly TaxAuthorityRejection[];
  },
  createdAt: Date,
): FiscalTask {
  return {
    kind: "credit_note_rejected",
    state: "open",
    pointOfSale,
    documentType: CREDIT_NOTE_C_DOCUMENT_TYPE,
    number,
    creditNoteId,
    rejections,
    createdAt,
  };
}
