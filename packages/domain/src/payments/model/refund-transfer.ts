export const REFUND_TRANSFER_KINDS = ["bank", "mercado_pago"] as const;
export type RefundTransferKind = (typeof REFUND_TRANSFER_KINDS)[number];

export interface RefundTransfer {
  kind: RefundTransferKind;
  operationNumber: string;
}
