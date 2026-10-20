import { expect, test } from "vitest";
import { methodFilterOptions, registerFilterOptions } from "./refunds-filters";
import {
  latePaymentRefund,
  noPendingRefunds,
  pendingRefunds,
  transferRefund,
} from "./test-support/refund-fixtures";

test("offers every register once, sorted by name, after the option for all of them", () => {
  const refunds = [latePaymentRefund, transferRefund, { ...transferRefund, id: "another" }];

  expect(registerFilterOptions(refunds)).toEqual([
    { value: "all", label: "Todas" },
    { value: latePaymentRefund.register_id, label: "Caja del frente" },
    { value: transferRefund.register_id, label: "Caja principal" },
  ]);
});

test("offers only the option for all registers when there are no refunds", () => {
  expect(registerFilterOptions(noPendingRefunds.refunds)).toEqual([
    { value: "all", label: "Todas" },
  ]);
});

test("offers every method once, labelled and sorted by label, after the option for all of them", () => {
  const refunds = [
    transferRefund,
    { ...transferRefund, id: "another" },
    { ...transferRefund, id: "point", method: "POINT" as const },
    { ...transferRefund, id: "qr", method: "QR" as const },
  ];

  expect(methodFilterOptions(refunds)).toEqual([
    { value: "all", label: "Todos" },
    { value: "POINT", label: "Point integrada" },
    { value: "QR", label: "QR de Mercado Pago" },
    { value: "TRANSFER", label: "Transferencia" },
  ]);
});

test("offers one method for refunds that share it", () => {
  expect(methodFilterOptions(pendingRefunds.refunds)).toEqual([
    { value: "all", label: "Todos" },
    { value: "TRANSFER", label: "Transferencia" },
  ]);
});
