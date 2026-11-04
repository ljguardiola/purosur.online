import type { RefundTransferKind } from "@purosur/domain";

export type RefundTransferFormValues = {
  kind: RefundTransferKind | null;
  operationNumber: string;
};

export const EMPTY_REFUND_TRANSFER_FORM: RefundTransferFormValues = {
  kind: null,
  operationNumber: "",
};

export function refundTransferRequestFrom(values: RefundTransferFormValues) {
  return { kind: values.kind, operation_number: values.operationNumber.trim() };
}

export const REFUND_TRANSFER_KIND_OPTIONS = [
  { value: "bank", label: "Transferencia bancaria" },
  { value: "mercado_pago", label: "Transferencia de Mercado Pago" },
] as const satisfies readonly { value: RefundTransferKind; label: string }[];

export const REFUND_TRANSFER_FIELDS = {
  kind: "kind",
  operation_number: "operationNumber",
} as const;

export const REFUND_TRANSFER_MESSAGES = {
  kind: "Elegí el tipo de transferencia.",
  operationNumber: "Ingresá el número de operación.",
};
