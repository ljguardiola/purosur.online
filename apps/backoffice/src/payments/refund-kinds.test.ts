import { expect, test } from "vitest";
import { madeOutsideTheSystem, sentToMercadoPago } from "./refund-kinds";
import { latePaymentRefund, transferRefund } from "./test-support/refund-fixtures";

const refunds = [transferRefund, latePaymentRefund];

test("keeps the refunds the cloud sends to Mercado Pago", () => {
  expect(sentToMercadoPago(refunds)).toEqual([latePaymentRefund]);
});

test("keeps the refunds made outside the system", () => {
  expect(madeOutsideTheSystem(refunds)).toEqual([transferRefund]);
});
