import { expect, test } from "vitest";
import { receiptLabel } from "./receipt-label";

test("writes a receipt as its type followed by its number", () => {
  expect(receiptLabel("factura_b", "0001-00001234")).toBe("Factura B 0001-00001234");
  expect(receiptLabel("remito", "R-9")).toBe("Remito R-9");
});

test("writes a receipt with no number as its type alone", () => {
  expect(receiptLabel("sin_comprobante", null)).toBe("Sin comprobante");
});
