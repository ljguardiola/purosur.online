import {
  deferredSaleReferenceFromQrText,
  FACTURA_C_VOUCHER_TYPE,
  fiscalQrVoucher,
} from "../../fiscal/index.js";

export type TicketReference =
  | { kind: "invoice"; pointOfSale: number; number: number }
  | { kind: "deferred"; id: string; shortCode: string };

export function ticketReferenceFromQrText(text: string): TicketReference | null {
  const voucher = fiscalQrVoucher(text);
  if (voucher !== null) {
    return voucher.voucherType === FACTURA_C_VOUCHER_TYPE
      ? { kind: "invoice", pointOfSale: voucher.pointOfSale, number: voucher.number }
      : null;
  }
  const deferred = deferredSaleReferenceFromQrText(text);
  return deferred === null ? null : { kind: "deferred", ...deferred };
}
