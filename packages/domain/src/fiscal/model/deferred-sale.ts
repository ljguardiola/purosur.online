import type { DeferralReason } from "./real-time-authorization.js";

export const SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const SHORT_CODE_LENGTH = 8;
export const SHORT_CODE_ATTEMPTS = 10;
const DEFERRED_SALE_QR_PREFIX = "purosur-deferred-sale:";

export interface DeferredSale {
  id: string;
  saleId: string;
  occurredAt: Date;
  total: number;
  reason: DeferralReason;
  shortCode: string;
  routedAt: Date;
}

export interface DeferredSaleReference {
  id: string;
  shortCode: string;
}

export interface DeferredSaleDocumentBlock {
  invoiceClass: "X";
  shortCode: string;
  qrText: string;
}

export function randomShortCode(nextIndex: (bound: number) => number): string {
  return Array.from(
    { length: SHORT_CODE_LENGTH },
    () => SHORT_CODE_ALPHABET[nextIndex(SHORT_CODE_ALPHABET.length)],
  ).join("");
}

export function isShortCode(code: string): boolean {
  return (
    code.length === SHORT_CODE_LENGTH &&
    [...code].every((char) => SHORT_CODE_ALPHABET.includes(char))
  );
}

export function deferredSaleQrText({ id, shortCode }: DeferredSaleReference): string {
  return `${DEFERRED_SALE_QR_PREFIX}${id}:${shortCode}`;
}

export function deferredSaleDocumentBlock(
  reference: DeferredSaleReference,
): DeferredSaleDocumentBlock {
  return {
    invoiceClass: "X",
    shortCode: reference.shortCode,
    qrText: deferredSaleQrText(reference),
  };
}
