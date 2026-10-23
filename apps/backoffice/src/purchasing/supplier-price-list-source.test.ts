import { expect, test } from "vitest";
import { supplierPriceListOriginOf } from "./supplier-price-list-source";

test("names a PDF list by its file", () => {
  expect(supplierPriceListOriginOf({ kind: "PDF", fileName: "lista.pdf" })).toEqual({
    name: "lista.pdf",
    detail: "PDF",
  });
});

test.each([
  ["https://distribuidora-sur.example/precios", "distribuidora-sur.example/precios"],
  [
    "http://distribuidora-sur.example/precios?pagina=2",
    "distribuidora-sur.example/precios?pagina=2",
  ],
  ["HTTPS://distribuidora-sur.example/precios", "distribuidora-sur.example/precios"],
  ["Http://distribuidora-sur.example/precios", "distribuidora-sur.example/precios"],
])("names a web page list by its address %s without the scheme", (url, name) => {
  expect(supplierPriceListOriginOf({ kind: "WEB_PAGE", url })).toEqual({
    name,
    detail: "Página web",
  });
});
