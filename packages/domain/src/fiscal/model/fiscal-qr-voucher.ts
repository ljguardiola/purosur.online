import { TAX_AUTHORITY_QR_URL } from "./factura-c-fiscal-block.js";

export interface FiscalQrVoucher {
  pointOfSale: number;
  voucherType: number;
  number: number;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function payloadOf(text: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(decodeURIComponent(text.slice(TAX_AUTHORITY_QR_URL.length)))) ?? {};
  } catch {
    return {};
  }
}

export function fiscalQrVoucher(text: string): FiscalQrVoucher | null {
  if (!text.startsWith(TAX_AUTHORITY_QR_URL)) {
    return null;
  }
  const { ptoVta, tipoCmp, nroCmp } = payloadOf(text);
  return isCount(ptoVta) && isCount(tipoCmp) && isCount(nroCmp)
    ? { pointOfSale: ptoVta, voucherType: tipoCmp, number: nroCmp }
    : null;
}
