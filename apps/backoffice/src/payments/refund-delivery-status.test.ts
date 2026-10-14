import { expect, test } from "vitest";
import { refundDeliveryStatus } from "./refund-delivery-status";
import {
  confirmedUnsentCloudRefund,
  noBalanceCloudRefund,
  refusedCloudRefund,
  sentCloudRefund,
  transferRefund,
  unconfirmedCloudRefund,
} from "./test-support/refund-fixtures";

test("has no status for a refund the cloud does not send", () => {
  expect(refundDeliveryStatus(transferRefund)).toBeNull();
});

test.each([
  [unconfirmedCloudRefund, "Sin confirmar"],
  [sentCloudRefund, "Enviado a Mercado Pago · en proceso"],
  [noBalanceCloudRefund, "Sin saldo en Mercado Pago · se reintenta"],
  [refusedCloudRefund, "Mercado Pago lo rechazó: pasó el plazo para reembolsar"],
  [confirmedUnsentCloudRefund, "Confirmado · se envía al reconectar"],
  [
    { ...refusedCloudRefund, last_refusal_reason: "something_new" },
    "Mercado Pago lo rechazó: motivo no reconocido",
  ],
])("tells how far a refund the cloud sends got", (refund, status) => {
  expect(refundDeliveryStatus(refund)).toBe(status);
});
