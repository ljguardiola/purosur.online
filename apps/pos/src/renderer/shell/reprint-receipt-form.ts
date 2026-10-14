import { reprintSaleReceiptMessageSchema } from "@purosur/contracts";

export const reprintReceiptFormRequestSchema = reprintSaleReceiptMessageSchema.omit({
  type: true,
  request_id: true,
  sale_id: true,
  authorization: true,
});

export type ReprintReceiptFormValues = { reason: string };

export const EMPTY_REPRINT_RECEIPT_FORM: ReprintReceiptFormValues = { reason: "" };

export function reprintReceiptRequestFrom({ reason }: ReprintReceiptFormValues): {
  reason: string;
} {
  return { reason };
}

export function invalidReasonMessage(maxLength: number): string {
  return `Escribí el motivo (hasta ${maxLength} caracteres).`;
}
