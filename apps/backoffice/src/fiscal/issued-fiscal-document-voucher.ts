import { z } from "zod";
import type { IssuedFiscalDocumentVoucher } from "./fiscal-queries";

const VOUCHER_KEY = /^[1-9]\d{0,2}-[1-9]\d{0,4}-[1-9]\d{0,7}$/;

export const voucherKeySchema = z.string().regex(VOUCHER_KEY);

export function voucherKeyOf(voucher: IssuedFiscalDocumentVoucher): string {
  return `${voucher.voucher_type}-${voucher.point_of_sale}-${voucher.number}`;
}

export function voucherOfKey(key: string): IssuedFiscalDocumentVoucher {
  const [voucher_type, point_of_sale, number] = key.split("-").map(Number);
  return {
    voucher_type: voucher_type ?? 0,
    point_of_sale: point_of_sale ?? 0,
    number: number ?? 0,
  };
}
