import { refundTransferSchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  EMPTY_REFUND_TRANSFER_FORM,
  REFUND_TRANSFER_KIND_OPTIONS,
  REFUND_TRANSFER_MESSAGES,
  refundTransferRequestFrom,
} from "./refund-transfer-form";

test("starts with no kind and no operation number", () => {
  expect(EMPTY_REFUND_TRANSFER_FORM).toEqual({ kind: null, operationNumber: "" });
});

test("builds the request from the kind and the operation number without the spaces around it", () => {
  expect(refundTransferRequestFrom({ kind: "mercado_pago", operationNumber: " 00123 " })).toEqual({
    kind: "mercado_pago",
    operation_number: "00123",
  });
});

test.each([
  ["no kind", { kind: null, operationNumber: "1" }],
  ["no operation number", { kind: "bank", operationNumber: "  " }],
] as const)("builds a request the contract refuses with %s", (_case, values) => {
  expect(refundTransferSchema.safeParse(refundTransferRequestFrom(values)).success).toBe(false);
});

test("offers the bank transfer and the Mercado Pago transfer", () => {
  expect(REFUND_TRANSFER_KIND_OPTIONS).toEqual([
    { value: "bank", label: "Transferencia bancaria" },
    { value: "mercado_pago", label: "Transferencia de Mercado Pago" },
  ]);
});

test.each([
  ["", "Ingresá el número de operación."],
  ["   ", "Ingresá el número de operación."],
  ["00123456", "Revisá el número de operación."],
])("tells about the operation number %j: %s", (operationNumber, message) => {
  expect(REFUND_TRANSFER_MESSAGES.operationNumber({ kind: "bank", operationNumber })).toBe(message);
});
