import { codePointLength } from "../../shared/index.js";
import type { FiscalDocumentType, TaxAuthorityRejection } from "./fiscal-rejection-standing.js";
import { CREDIT_NOTE_C_DOCUMENT_TYPE } from "./fiscal-voucher-type.js";

export const OPEN_FISCAL_TASK_STATE = "open";
export const CLOSED_FISCAL_TASK_STATE = "closed";
export const FISCAL_TASK_STATES = [OPEN_FISCAL_TASK_STATE, CLOSED_FISCAL_TASK_STATE] as const;
export type FiscalTaskState = (typeof FISCAL_TASK_STATES)[number];

export const FISCAL_TASK_CLOSING_NOTE_MAX_LENGTH = 500;

export function isFiscalTaskClosingNoteTooLong(note: string): boolean {
  return codePointLength(note) > FISCAL_TASK_CLOSING_NOTE_MAX_LENGTH;
}

export const DEFERRED_SALE_EXPIRED_TASK_KIND = "deferred_sale_expired";
export const FISCAL_TASK_KINDS = [
  "external_invoicing",
  "credit_note_rejected",
  DEFERRED_SALE_EXPIRED_TASK_KIND,
] as const;
export type FiscalTaskKind = (typeof FISCAL_TASK_KINDS)[number];

export type FiscalTaskDocumentType = FiscalDocumentType | typeof CREDIT_NOTE_C_DOCUMENT_TYPE;

export interface ExternalInvoicingVoucher {
  issuedOn: string;
  total: number;
  authorizationCode: string;
}

interface FiscalTaskBase {
  state: typeof OPEN_FISCAL_TASK_STATE;
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

export function externalInvoicingTask(
  {
    pointOfSale,
    documentType,
    number,
    voucher,
  }: {
    pointOfSale: number;
    documentType: FiscalTaskDocumentType;
    number: number;
    voucher: ExternalInvoicingVoucher;
  },
  createdAt: Date,
): FiscalTask {
  return {
    kind: "external_invoicing",
    state: OPEN_FISCAL_TASK_STATE,
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
    state: OPEN_FISCAL_TASK_STATE,
    pointOfSale,
    documentType: CREDIT_NOTE_C_DOCUMENT_TYPE,
    number,
    creditNoteId,
    rejections,
    createdAt,
  };
}
