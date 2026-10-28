import { describe, expect, it } from "vitest";
import { tiendistaStoreProductDataUrl } from "./tiendista-store.js";

const PRODUCT_DATA = "https://datostienda-pc3gz7vuxa-uc.a.run.app";

describe("tiendistaStoreProductDataUrl", () => {
  it.each([
    ["https://tiendista.com/almacen-del-sur", `${PRODUCT_DATA}/almacen-del-sur/producto`],
    ["http://tiendista.com/almacen-del-sur", `${PRODUCT_DATA}/almacen-del-sur/producto`],
    ["https://www.tiendista.com/almacen-del-sur", `${PRODUCT_DATA}/almacen-del-sur/producto`],
    ["https://TIENDISTA.com/almacen-del-sur", `${PRODUCT_DATA}/almacen-del-sur/producto`],
    ["https://tiendista.com/almacen-del-sur/", `${PRODUCT_DATA}/almacen-del-sur/producto`],
    ["https://tiendista.com/almacen-del-sur?ref=1#top", `${PRODUCT_DATA}/almacen-del-sur/producto`],
    ["https://tiendista.com/almac%C3%A9n%20sur", `${PRODUCT_DATA}/almac%C3%A9n%20sur/producto`],
  ])("recognizes %s as a store", (address, expected) => {
    expect(tiendistaStoreProductDataUrl(address)).toBe(expected);
  });

  it.each([
    "https://tiendista.com/",
    "https://tiendista.com",
    "https://tiendista.com//",
    "https://tiendista.com/almacen-del-sur/productos",
    "https://tiendista.com.evil.example/almacen-del-sur",
    "https://notiendista.com/almacen-del-sur",
    "https://evil.example/tiendista.com/almacen-del-sur",
    "https://shop.tiendista.com/almacen-del-sur",
    "https://visitor@tiendista.com/almacen-del-sur",
    "https://:secret@tiendista.com/almacen-del-sur",
    "ftp://tiendista.com/almacen-del-sur",
    "https://supplier.example/precios",
    "not an address",
    "",
  ])("does not recognize %s", (address) => {
    expect(tiendistaStoreProductDataUrl(address)).toBeNull();
  });
});
