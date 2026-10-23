import { expect, test } from "vitest";
import { webPageRefusalMessage } from "./supplier-price-list-web-page-refusal";

test.each([
  [
    "invalid_address",
    "No se pudo leer: la dirección tiene que ser completa, empezar con http:// o https:// y no llevar usuario ni contraseña.",
  ],
  [
    "address_not_public",
    "No se pudo leer: la dirección no es de una página pública. Tiene que ser la página del proveedor en internet.",
  ],
  ["too_many_redirects", "No se pudo leer: la página redirige más de 3 veces."],
  ["too_large", "No se pudo leer: la página pesa más de 10 MB."],
  ["too_slow", "No se pudo leer: la página tardó más de 30 segundos en responder."],
  ["unsupported_content", "No se pudo leer: la dirección no es un PDF ni una página web."],
  ["unreachable", "No se pudo leer: no se pudo abrir la página. Revisá la dirección."],
] as const)("explains a page refused for %s", (reason, message) => {
  expect(webPageRefusalMessage(reason)).toBe(message);
});
