import type { JsonValue } from "../../shared/index.js";
import { FACTURA_C_VOUCHER_TYPE } from "./factura-c-fiscal-block.js";
import type { Fortnight } from "./offline-authorization-code.js";
import type { VoucherReference } from "./orphan-authorization.js";
import type { FiscalDocumentState } from "./real-time-authorization.js";

export interface SaleInvoice {
  origin: "real_time" | "offline";
  state: FiscalDocumentState;
  pointOfSale: number;
  number: number;
  buyerTaxStatusCode: number;
}

export interface CorrectedInvoice {
  voucher: VoucherReference;
  buyerTaxStatusCode: number;
}

export type CreditNoteOrigin =
  | { kind: "sale_void" }
  | { kind: "sale_return"; returnId: string; issuedOn: string };

interface CreditNoteToIssueBase {
  creditNoteId: string;
  saleId: string;
  total: number;
  origin: CreditNoteOrigin;
}

export interface InvoicedCreditNote extends CreditNoteToIssueBase {
  receiverTaxStatusCode: number;
  correctedVoucher: VoucherReference;
}

export interface AwaitingCreditNote extends CreditNoteToIssueBase {
  receiverTaxStatusCode: null;
  correctedVoucher: null;
}

export type CreditNoteToIssue = InvoicedCreditNote | AwaitingCreditNote;

export function tiedToInvoice(
  { receiverTaxStatusCode: _status, correctedVoucher: _voucher, ...note }: AwaitingCreditNote,
  { voucher, buyerTaxStatusCode }: CorrectedInvoice,
): InvoicedCreditNote {
  return { ...note, receiverTaxStatusCode: buyerTaxStatusCode, correctedVoucher: voucher };
}

export type CreditNoteAnswer =
  | {
      kind: "authorized";
      pointOfSale: number;
      number: number;
      issuedOn: string;
      issuedAt: Date;
      authorizationCode: string;
      authorizationCodeDueOn: string;
    }
  | { kind: "rejected" }
  | { kind: "regularization_required" }
  | { kind: "in_progress" };

export interface CreditNoteIssuedOffline {
  kind: "issued_offline";
  pointOfSale: number;
  number: number;
  issuedOn: string;
  issuedAt: Date;
  offlineAuthorizationCode: string;
  fortnight: Fortnight;
}

export type VoidCreditNoteStanding =
  | CreditNoteAnswer
  | { kind: "already_credited" }
  | CreditNoteIssuedOffline;

export type RequestedCreditNoteAnswer = Exclude<
  VoidCreditNoteStanding,
  { kind: "in_progress" | "issued_offline" }
>;

type ConfirmedCreditNoteAnswer = Exclude<CreditNoteAnswer, { kind: "in_progress" }>;

export interface RestoredCreditNoteAnswer {
  creditNoteId: string;
  answeredAt: Date;
  answer: ConfirmedCreditNoteAnswer | { kind: "already_credited" } | CreditNoteIssuedOffline;
}

export function restoredCreditNoteIssuedAt(
  answer: RestoredCreditNoteAnswer["answer"],
): Date | null {
  return answer.kind === "authorized" || answer.kind === "issued_offline" ? answer.issuedAt : null;
}

export type CreditNoteStanding =
  | { kind: "not_requested" }
  | {
      kind: "requested";
      number: number;
      issuedOn: string;
      requestedAt: Date;
      unclearAnsweredAt: Date | null;
    }
  | {
      kind: "authorized";
      number: number;
      issuedOn: string;
      requestedAt: Date;
      authorizationCode: string;
      authorizationCodeDueOn: string;
    }
  | { kind: "rejected" }
  | { kind: "regularization_required" };

export function creditNoteAnswerOf(
  standing: CreditNoteStanding,
  pointOfSale: number,
): CreditNoteAnswer {
  switch (standing.kind) {
    case "authorized": {
      const { kind: _kind, requestedAt, ...authorized } = standing;
      return { kind: "authorized", pointOfSale, issuedAt: requestedAt, ...authorized };
    }
    case "rejected":
      return { kind: "rejected" };
    case "regularization_required":
      return { kind: "regularization_required" };
    case "not_requested":
    case "requested":
      return { kind: "in_progress" };
  }
}

export function confirmedCreditNoteAnswer(
  standing: CreditNoteStanding,
  pointOfSale: number,
): ConfirmedCreditNoteAnswer | null {
  const answer = creditNoteAnswerOf(standing, pointOfSale);
  return answer.kind === "in_progress" ? null : answer;
}

export type RestoredCreditNoteSettlement =
  | { kind: "answered"; answer: RestoredCreditNoteAnswer["answer"] }
  | { kind: "never_requested" }
  | { kind: "unsettled" };

export function restoredCreditNoteSettlement(
  recorded: { standing: CreditNoteStanding; pointOfSale: number } | null,
  alreadyCreditedRefusalKept: boolean,
  issuedOffline: CreditNoteIssuedOffline | null = null,
): RestoredCreditNoteSettlement {
  if (issuedOffline !== null) {
    return { kind: "answered", answer: issuedOffline };
  }
  if (recorded !== null) {
    const answer = confirmedCreditNoteAnswer(recorded.standing, recorded.pointOfSale);
    return answer === null ? { kind: "unsettled" } : { kind: "answered", answer };
  }
  return alreadyCreditedRefusalKept
    ? { kind: "answered", answer: { kind: "already_credited" } }
    : { kind: "never_requested" };
}

export const AUTHORIZED_INVOICE_STATE = "AUTHORIZED" satisfies FiscalDocumentState;

function isAuthorized({ state }: SaleInvoice): boolean {
  return state === AUTHORIZED_INVOICE_STATE;
}

export function invoiceToCorrect(invoices: readonly SaleInvoice[]): CorrectedInvoice | null {
  const authorized = invoices.filter(isAuthorized);
  const received = authorized.find(({ origin }) => origin === "offline") ?? authorized[0];
  if (received === undefined) {
    return null;
  }
  return {
    voucher: {
      voucherType: FACTURA_C_VOUCHER_TYPE,
      pointOfSale: received.pointOfSale,
      number: received.number,
    },
    buyerTaxStatusCode: received.buyerTaxStatusCode,
  };
}

export function creditNoteToIssuePayload<
  Note extends {
    creditNoteId: string;
    total: number;
    receiverTaxStatusCode: number | null;
    correctedVoucher: VoucherReference | null;
    origin?: CreditNoteOrigin;
  },
>({
  creditNoteId,
  total,
  receiverTaxStatusCode,
  correctedVoucher,
  origin,
}: Note): { [member: string]: JsonValue } {
  return {
    id: creditNoteId,
    total,
    receiver_tax_status_code: receiverTaxStatusCode,
    corrects:
      correctedVoucher === null
        ? null
        : {
            voucher_type: correctedVoucher.voucherType,
            point_of_sale: correctedVoucher.pointOfSale,
            number: correctedVoucher.number,
          },
    ...(origin?.kind === "sale_return" ? { issued_on: origin.issuedOn } : {}),
  };
}
