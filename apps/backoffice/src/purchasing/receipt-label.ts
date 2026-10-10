import type { ReceiptType } from "@purosur/domain";

const RECEIPT_TYPE_LABELS = {
  factura_b: "Factura B",
  factura_c: "Factura C",
  remito: "Remito",
  ticket: "Ticket",
  otro: "Otro",
  sin_comprobante: "Sin comprobante",
} satisfies Record<ReceiptType, string>;

export function receiptLabel(type: ReceiptType, number: string | null): string {
  const label = RECEIPT_TYPE_LABELS[type];
  return number === null ? label : `${label} ${number}`;
}
