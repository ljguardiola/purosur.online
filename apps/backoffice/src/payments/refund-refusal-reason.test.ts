import { expect, test } from "vitest";
import { refundRefusalReason } from "./refund-refusal-reason";

test.each([
  ["cannot_refund_order", "la orden no admite reembolsos"],
  ["refund_period_exceeded", "pasó el plazo para reembolsar"],
  ["payment_not_refundable", "el pago no se puede reembolsar"],
  ["in_store_payment_refund_order", "el pago de la orden se hizo en el local y no se reembolsa por acá"],
  ["idempotency_key_already_used", "Mercado Pago ya recibió este pedido con otros datos"],
])("explains %s in Spanish", (code, text) => {
  expect(refundRefusalReason(code)).toBe(text);
});

test("gives a generic reason for a code it does not know", () => {
  expect(refundRefusalReason("something_new")).toBe("motivo no reconocido");
});
