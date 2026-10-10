import { expect, test } from "vitest";
import { RECEIPT_TYPE_OPTIONS, receiptLabel } from "./receipt-label";

test("offers every receipt type with its Spanish name, in the contract's order", () => {
  expect(RECEIPT_TYPE_OPTIONS.map((option) => option.label)).toEqual([
    "Factura B",
    "Factura C",
    "Remito",
    "Ticket",
    "Otro",
    "Sin comprobante",
  ]);
  expect(RECEIPT_TYPE_OPTIONS.map((option) => option.value)).toEqual([
    "factura_b",
    "factura_c",
    "remito",
    "ticket",
    "otro",
    "sin_comprobante",
  ]);
});

test("writes a receipt as its type followed by its number", () => {
  expect(receiptLabel("factura_b", "0001-00001234")).toBe("Factura B 0001-00001234");
  expect(receiptLabel("remito", "R-9")).toBe("Remito R-9");
});

test("writes a receipt with no number as its type alone", () => {
  expect(receiptLabel("sin_comprobante", null)).toBe("Sin comprobante");
});
