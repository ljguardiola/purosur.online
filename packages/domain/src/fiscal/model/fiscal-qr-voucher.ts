import { TAX_AUTHORITY_QR_URL } from "./factura-c-fiscal-block.js";

export interface FiscalQrVoucher {
  pointOfSale: number;
  voucherType: number;
  number: number;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function payloadOf(text: string): unknown {
  try {
    return JSON.parse(atob(decodeURIComponent(text.slice(TAX_AUTHORITY_QR_URL.length))));
  } catch {
    return null;
  }
}

export function fiscalQrVoucher(text: string): FiscalQrVoucher | null {
  if (!text.startsWith(TAX_AUTHORITY_QR_URL)) {
    return null;
  }
  const payload = payloadOf(text);
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const { ptoVta, tipoCmp, nroCmp } = payload as Record<string, unknown>;
  return isCount(ptoVta) && isCount(tipoCmp) && isCount(nroCmp)
    ? { pointOfSale: ptoVta, voucherType: tipoCmp, number: nroCmp }
    : null;
}
