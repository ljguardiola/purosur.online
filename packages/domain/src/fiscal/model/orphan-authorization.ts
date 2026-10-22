import {
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
} from "./factura-c-fiscal-block.js";
import { FACTURA_C_DOCUMENT_TYPE, type FiscalDocumentType } from "./fiscal-rejection-standing.js";
import {
  type ExternalInvoicingVoucher,
  externalInvoicingTask,
  type FiscalTask,
  type FiscalTaskDocumentType,
} from "./fiscal-task.js";
import type { RealTimeAuthorizationAnswer } from "./real-time-authorization.js";
import {
  outcomeToldToAskingRegister,
  type RecordedRequestOutcome,
  type TaxAuthorityVoucher,
  type UnclearDocument,
  unclearDocumentSettlement,
  voucherMatchesDocument,
} from "./unclear-outcome-decision.js";

export interface VoucherReference {
  voucherType: number;
  pointOfSale: number;
  number: number;
}

export type OrphanEvidence =
  | {
      kind: "confirmed";
      pointOfSale: number;
      number: number;
      voucher: TaxAuthorityVoucher;
    }
  | { kind: "not_confirmed" };

export interface LocalRequestAtNumber extends Omit<UnclearDocument, "number"> {
  fiscalDocumentId: string;
  saleId: string;
  answer: RealTimeAuthorizationAnswer | null;
}

export type RequestsAtNumber =
  | { kind: "requests"; requests: readonly LocalRequestAtNumber[] }
  | { kind: "already_regularized" };

export type SaleDocument =
  | { kind: "offline"; voucher: VoucherReference }
  | { kind: "real_time"; voucher: VoucherReference; outcome: RecordedRequestOutcome };

export function requestBehindVoucher(
  voucher: TaxAuthorityVoucher,
  requests: readonly LocalRequestAtNumber[],
): LocalRequestAtNumber | null {
  return (
    requests.find(
      (request) => request.answer?.kind !== "rejected" && voucherMatchesDocument(voucher, request),
    ) ?? null
  );
}

function isAuthorizedDocument(document: SaleDocument): boolean {
  if (document.kind === "offline") {
    return true;
  }
  const told = outcomeToldToAskingRegister(document.outcome);
  return told.kind !== "pending" && unclearDocumentSettlement(told).state === "AUTHORIZED";
}

export function authorizedVoucherAmong(
  documents: readonly SaleDocument[],
): VoucherReference | null {
  return documents.find(isAuthorizedDocument)?.voucher ?? null;
}

export interface RecordedAuthorizationRequest extends UnclearDocument {
  outcome: RecordedRequestOutcome;
}

export function orphanEvidenceOfRecordedRequest({
  pointOfSale,
  request,
}: {
  pointOfSale: number;
  request: RecordedAuthorizationRequest;
}): OrphanEvidence {
  const told = outcomeToldToAskingRegister(request.outcome);
  if (told.kind === "pending") {
    return { kind: "not_confirmed" };
  }
  const settlement = unclearDocumentSettlement(told);
  if (settlement.state !== "AUTHORIZED") {
    return { kind: "not_confirmed" };
  }
  return {
    kind: "confirmed",
    pointOfSale,
    number: request.number,
    voucher: {
      issuedOn: request.issuedOn,
      total: request.total,
      documentType: FACTURA_C_VOUCHER_TYPE,
      receiverDocumentType: FINAL_CONSUMER_DOCUMENT_TYPE,
      receiverDocumentNumber: FINAL_CONSUMER_DOCUMENT_NUMBER,
      receiverTaxStatusCode: request.buyerTaxStatusCode,
      authorizationCode: settlement.authorizationCode,
      authorizationCodeDueOn: settlement.authorizationCodeDueOn,
    },
  };
}

export type LocalStanding =
  | { kind: "no_local_sale" }
  | { kind: "local_sale"; saleId: string; otherAuthorizedVoucher: VoucherReference | null }
  | { kind: "already_regularized" };

export interface SaleCreditNote {
  creditedVoucher: VoucherReference;
  keptVoucher: VoucherReference | null;
}

function sameVoucher(one: VoucherReference, other: VoucherReference): boolean {
  return (
    one.voucherType === other.voucherType &&
    one.pointOfSale === other.pointOfSale &&
    one.number === other.number
  );
}

export function localStandingOfUnrecordedSale(
  { saleId, voucher }: { saleId: string; voucher: VoucherReference },
  {
    otherDocuments,
    creditNotes,
  }: { otherDocuments: readonly SaleDocument[]; creditNotes: readonly SaleCreditNote[] },
): LocalStanding {
  if (
    creditNotes.some(({ keptVoucher }) => keptVoucher !== null && sameVoucher(keptVoucher, voucher))
  ) {
    return { kind: "local_sale", saleId, otherAuthorizedVoucher: null };
  }
  const otherAuthorizedVoucher = authorizedVoucherAmong(
    otherDocuments.filter(
      (document) =>
        !creditNotes.some(({ creditedVoucher }) => sameVoucher(creditedVoucher, document.voucher)),
    ),
  );
  return otherAuthorizedVoucher === null
    ? { kind: "no_local_sale" }
    : { kind: "local_sale", saleId, otherAuthorizedVoucher };
}

export interface CreditNoteDecision {
  kind: "credit_note";
  saleId: string;
  pointOfSale: number;
  associatedVoucher: VoucherReference;
  keptVoucher: VoucherReference;
  total: number;
  receiverTaxStatusCode: number;
}

interface ExternalInvoicingDecision {
  kind: "external_invoicing";
  pointOfSale: number;
  documentType: FiscalDocumentType;
  number: number;
  voucher: ExternalInvoicingVoucher;
}

export type OrphanAuthorizationDecision =
  | CreditNoteDecision
  | ExternalInvoicingDecision
  | { kind: "none" };

export function decideOrphanAuthorization({
  evidence,
  local,
}: {
  evidence: OrphanEvidence;
  local: LocalStanding;
}): OrphanAuthorizationDecision {
  if (evidence.kind === "not_confirmed" || local.kind === "already_regularized") {
    return { kind: "none" };
  }
  const { pointOfSale, number, voucher } = evidence;
  if (local.kind === "no_local_sale") {
    return {
      kind: "external_invoicing",
      pointOfSale,
      documentType: FACTURA_C_DOCUMENT_TYPE,
      number,
      voucher: {
        issuedOn: voucher.issuedOn,
        total: voucher.total,
        authorizationCode: voucher.authorizationCode,
      },
    };
  }
  if (local.otherAuthorizedVoucher === null) {
    return { kind: "none" };
  }
  return {
    kind: "credit_note",
    saleId: local.saleId,
    pointOfSale,
    associatedVoucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale, number },
    keptVoucher: local.otherAuthorizedVoucher,
    total: voucher.total,
    receiverTaxStatusCode: voucher.receiverTaxStatusCode,
  };
}

export interface ExternalBilling {
  pointOfSale: number;
  documentType: FiscalTaskDocumentType;
  number: number;
}

export type ExternalInvoicingRegularization = {
  kind: "external_invoicing";
  externalBilling: ExternalBilling;
  task: FiscalTask;
};

export type OrphanRegularization =
  | (CreditNoteDecision & { creditNoteId: string })
  | ExternalInvoicingRegularization;

export function orphanRegularization(
  decision: OrphanAuthorizationDecision,
  { creditNoteId, now }: { creditNoteId: string; now: Date },
): OrphanRegularization | null {
  switch (decision.kind) {
    case "none":
      return null;
    case "credit_note":
      return { ...decision, creditNoteId };
    case "external_invoicing": {
      const { pointOfSale, documentType, number } = decision;
      return {
        kind: "external_invoicing",
        externalBilling: { pointOfSale, documentType, number },
        task: externalInvoicingTask(decision, now),
      };
    }
  }
}
