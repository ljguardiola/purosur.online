import { expect, test } from "vitest";
import { refundConfirmationNotice } from "./refund-confirmation-notice";

const refund_id = "55555555-5555-4555-8555-555555555555";

test.each([
  [
    { refund_id, outcome: "sent" as const },
    {
      tone: "success",
      title: "Reembolso enviado a Mercado Pago",
      description: "Queda en proceso hasta que lo acredite.",
    },
  ],
  [
    { refund_id, outcome: "done" as const, done_at: "2026-10-09T10:00:00.000Z" },
    { tone: "success", title: "Mercado Pago acreditó el reembolso" },
  ],
  [
    { refund_id, outcome: "insufficient_balance" as const },
    {
      tone: "warning",
      title: "La cuenta de Mercado Pago no tiene saldo suficiente",
      description: "El reembolso queda pendiente y se reintenta solo.",
    },
  ],
  [
    { refund_id, outcome: "refused" as const, reason: "cannot_refund_order" },
    {
      tone: "error",
      title: "Mercado Pago rechazó el reembolso",
      description: "La orden no admite reembolsos.",
    },
  ],
  [
    { refund_id, outcome: "refused" as const, reason: "something_new" },
    {
      tone: "error",
      title: "Mercado Pago rechazó el reembolso",
      description: "Motivo no reconocido.",
    },
  ],
  [
    { refund_id, outcome: "provider_unavailable" as const },
    {
      tone: "warning",
      title: "No se pudo contactar a Mercado Pago",
      description: "Se reintenta solo.",
    },
  ],
])("presents the answer %j", (body, notice) => {
  expect(refundConfirmationNotice(body)).toEqual(notice);
});
