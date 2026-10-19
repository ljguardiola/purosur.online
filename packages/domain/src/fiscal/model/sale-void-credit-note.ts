import { type JsonValue, SALE_VOIDED_EVENT_TYPE } from "../../shared/index.js";
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
      authorizationCode: string;
      authorizationCodeDueOn: string;
    }
  | { kind: "rejected" }
  | { kind: "in_progress" };

export type VoidCreditNoteStanding = CreditNoteAnswer | { kind: "already_credited" };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integerOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function saleVoidCreditNoteOfEvent(event: {
  event_type: string;
  aggregate_id: string;
  payload: { [member: string]: JsonValue };
}): SaleVoidCreditNote | null {
  if (event.event_type !== SALE_VOIDED_EVENT_TYPE) {
    return null;
  }
  const { credit_note: creditNote } = event.payload;
  if (!isRecord(creditNote) || !isRecord(creditNote["corrects"])) {
    return null;
  }
  const { id, total } = creditNote;
  const { corrects } = creditNote;
  const receiverTaxStatusCode = integerOf(creditNote["receiver_tax_status_code"]);
  const voucherType = integerOf(corrects["voucher_type"]);
  const pointOfSale = integerOf(corrects["point_of_sale"]);
  const number = integerOf(corrects["number"]);
  const totalInteger = integerOf(total);
  if (
    typeof id !== "string" ||
    id === "" ||
    totalInteger === null ||
    totalInteger <= 0 ||
    receiverTaxStatusCode === null ||
    voucherType === null ||
    pointOfSale === null ||
    number === null
  ) {
    return null;
  }
  return {
    creditNoteId: id,
    saleId: event.aggregate_id,
    total: totalInteger,
    receiverTaxStatusCode,
    correctedVoucher: { voucherType, pointOfSale, number },
  };
}
