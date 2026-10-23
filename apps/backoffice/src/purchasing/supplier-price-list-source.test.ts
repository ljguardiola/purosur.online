import { expect, test } from "vitest";
import { supplierPriceListOriginOf } from "./supplier-price-list-source";

test("names a PDF list by its file", () => {
  expect(supplierPriceListOriginOf({ kind: "PDF", fileName: "lista.pdf" })).toEqual({
    name: "lista.pdf",
    detail: "PDF",
  });
});

test.each([
  ["https://distribuidoradelsur.com.ar/precios", "distribuidoradelsur.com.ar/precios"],
  [
    "http://distribuidoradelsur.com.ar/precios?pagina=2",
    "distribuidoradelsur.com.ar/precios?pagina=2",
  ],
])("names a web page list by its address %s without the scheme", (url, name) => {
  expect(supplierPriceListOriginOf({ kind: "WEB_PAGE", url })).toEqual({
    name,
    detail: "Página web",
  });
});
