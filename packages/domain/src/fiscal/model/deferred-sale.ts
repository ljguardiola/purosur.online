import type { DeferralReason } from "./real-time-authorization.js";

export const SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const SHORT_CODE_LENGTH = 8;
export const DEFERRED_SALE_QR_PREFIX = "purosur-deferred-sale:";

const SHORT_CODE_GROUP_LENGTH = SHORT_CODE_LENGTH / 2;
const SHORT_CODE_PATTERN = new RegExp(`^[${SHORT_CODE_ALPHABET}]{${SHORT_CODE_LENGTH}}$`);

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

export function formatShortCode(shortCode: string): string {
  return `${shortCode.slice(0, SHORT_CODE_GROUP_LENGTH)}-${shortCode.slice(SHORT_CODE_GROUP_LENGTH)}`;
}

export function deferredSaleQrText({ id, shortCode }: DeferredSaleReference): string {
  return `${DEFERRED_SALE_QR_PREFIX}${id}:${shortCode}`;
}

export function parseDeferredSaleQrText(text: string): DeferredSaleReference | undefined {
  if (!text.startsWith(DEFERRED_SALE_QR_PREFIX)) {
    return undefined;
  }
  const parts = text.slice(DEFERRED_SALE_QR_PREFIX.length).split(":");
  const [id, shortCode] = parts;
  if (parts.length !== 2 || id === undefined || id === "" || shortCode === undefined) {
    return undefined;
  }
  return SHORT_CODE_PATTERN.test(shortCode) ? { id, shortCode } : undefined;
}

export function deferredSaleDocumentBlock(
  reference: DeferredSaleReference,
): DeferredSaleDocumentBlock {
  return {
    invoiceClass: "X",
    shortCode: formatShortCode(reference.shortCode),
    qrText: deferredSaleQrText(reference),
  };
}
