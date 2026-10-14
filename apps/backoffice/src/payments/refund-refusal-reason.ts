const REFUSAL_REASONS = new Map([
  ["cannot_refund_order", "la orden no admite reembolsos"],
  ["refund_period_exceeded", "pasó el plazo para reembolsar"],
  ["payment_not_refundable", "el pago no se puede reembolsar"],
  [
    "in_store_payment_refund_order",
    "el pago de la orden se hizo en el local y no se reembolsa por acá",
  ],
  ["idempotency_key_already_used", "Mercado Pago ya recibió este pedido con otros datos"],
]);

export function refundRefusalReason(code: string): string {
  return REFUSAL_REASONS.get(code) ?? "motivo no reconocido";
}
