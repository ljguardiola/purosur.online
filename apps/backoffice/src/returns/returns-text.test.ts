import { expect, test } from "vitest";
import {
  returnLineDetail,
  returnLineDispositionText,
  returnLineReasonText,
  returnLineResolutionText,
  returnSaleText,
} from "./returns-text";

test.each([
  ["change_of_mind", "restock", "refund", "Arrepentimiento · vuelve a la venta · Reintegro"],
  ["change_of_mind", "discard", "exchange", "Arrepentimiento · se descarta · Cambio"],
  ["defective", "restock", "exchange", "Defecto · vuelve a la venta · Cambio"],
  ["defective", "discard", "refund", "Defecto · se descarta · Reintegro"],
] as const)(
  "writes a %s return whose goods %s and is resolved as %s as %s",
  (reason, disposition, resolution, text) => {
    expect(returnLineDetail({ reason, disposition, resolution })).toBe(text);
  },
);

test.each([
  ["refund", "Reintegro"],
  ["exchange", "Cambio"],
] as const)("names the %s resolution of a returned line %s", (resolution, text) => {
  expect(returnLineResolutionText(resolution)).toBe(text);
});

test("writes the operation number of a sale and its invoice", () => {
  expect(
    returnSaleText({ operation_number: 12, invoice: { point_of_sale: 5, number: 41 } }),
  ).toEqual({ operation: "Operación 000012", invoice: "Comprobante 00005-00000041" });
});

test("leaves out the operation and the invoice a sale does not have", () => {
  expect(returnSaleText({ operation_number: null, invoice: null })).toEqual({
    operation: null,
    invoice: null,
  });
});

test.each([
  ["change_of_mind", "Arrepentimiento"],
  ["defective", "Defecto"],
] as const)("names the %s reason of a returned line %s", (reason, text) => {
  expect(returnLineReasonText(reason)).toBe(text);
});

test.each([
  ["restock", "vuelve a la venta"],
  ["discard", "se descarta"],
] as const)("says a returned line's goods with the %s disposition %s", (disposition, text) => {
  expect(returnLineDispositionText(disposition)).toBe(text);
});
