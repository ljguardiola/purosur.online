import { describe, expect, test } from "vitest";
import { webPageRefusalHint, webPageRefusalMessage } from "./supplier-price-list-web-page-refusal";

test.each([
  [
    "invalid_address",
    "La dirección tiene que ser completa, empezar con http:// o https:// y no llevar usuario ni contraseña.",
  ],
  [
    "address_not_public",
    "La dirección no es de una página pública. Tiene que ser la página del proveedor en internet.",
  ],
  ["too_many_redirects", "La página redirige demasiadas veces."],
  ["too_large", "La página es demasiado pesada."],
  ["too_slow", "La página tardó demasiado en responder."],
  ["unsupported_content", "La dirección no es un PDF ni una página web."],
  [
    "store_catalog_unavailable",
    "La tienda no entregó su lista de productos. Probá de nuevo más tarde.",
  ],
  ["unreachable", "La página no respondió. Revisá la dirección."],
] as const)("explains a page refused for %s", (reason, message) => {
  expect(webPageRefusalMessage(reason)).toBe(message);
});

describe("what else is not read", () => {
  test.each(["invalid_address", "address_not_public", "unreachable"] as const)(
    "is told after a page refused for %s",
    (reason) => {
      expect(webPageRefusalHint(reason)).toBe(
        "Tampoco se lee una página que redirige demasiadas veces, tarda demasiado, es muy pesada o no es PDF ni una página web.",
      );
    },
  );

  test.each(["too_many_redirects", "too_large", "too_slow", "unsupported_content"] as const)(
    "is not told after a page refused for %s, one of those causes",
    (reason) => {
      expect(webPageRefusalHint(reason)).toBeUndefined();
    },
  );

  test("is not told after a store that did not hand over its products", () => {
    expect(webPageRefusalHint("store_catalog_unavailable")).toBeUndefined();
  });
});
