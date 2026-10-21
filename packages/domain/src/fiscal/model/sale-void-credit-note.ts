import type { JsonValue } from "../../shared/index.js";
import { FACTURA_C_VOUCHER_TYPE } from "./factura-c-fiscal-block.js";
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

export interface SaleVoidCreditNote {
  creditNoteId: string;
  saleId: string;
  total: number;
  receiverTaxStatusCode: number;
  correctedVoucher: VoucherReference;
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
  | { kind: "in_progress" };

export type VoidCreditNoteStanding = CreditNoteAnswer | { kind: "already_credited" };

export type ConfirmedCreditNoteAnswer = Exclude<CreditNoteAnswer, { kind: "in_progress" }>;

export interface RestoredCreditNoteAnswer {
  saleId: string;
  creditNoteId: string;
  answeredAt: Date;
  answer: ConfirmedCreditNoteAnswer;
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
  | { kind: "rejected" };

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

function isAuthorized({ state }: SaleInvoice): boolean {
  return state === "AUTHORIZED";
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

export function saleVoidCreditNotePayload({
  creditNoteId,
  total,
  receiverTaxStatusCode,
  correctedVoucher,
}: SaleVoidCreditNote): { [member: string]: JsonValue } {
  return {
    id: creditNoteId,
    total,
    receiver_tax_status_code: receiverTaxStatusCode,
    corrects: {
      voucher_type: correctedVoucher.voucherType,
      point_of_sale: correctedVoucher.pointOfSale,
      number: correctedVoucher.number,
    },
  };
}
