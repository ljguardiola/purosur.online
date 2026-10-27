import type { WebPageRefusalReason } from "./supplier-price-lists-api";

const WEB_PAGE_REFUSAL_MESSAGES = {
  invalid_address:
    "La dirección tiene que ser completa, empezar con http:// o https:// y no llevar usuario ni contraseña.",
  address_not_public:
    "La dirección no es de una página pública. Tiene que ser la página del proveedor en internet.",
  too_many_redirects: "La página redirige demasiadas veces.",
  too_large: "La página es demasiado pesada.",
  too_slow: "La página tardó demasiado en responder.",
  unsupported_content: "La dirección no es un PDF ni una página web.",
  store_catalog_unavailable:
    "La tienda no entregó su lista de productos. Probá de nuevo más tarde.",
  unreachable: "La página no respondió. Revisá la dirección.",
} satisfies Record<WebPageRefusalReason, string>;

const WHAT_ELSE_IS_NOT_READ =
  "Tampoco se lee una página que redirige demasiadas veces, tarda demasiado, es muy pesada o no es PDF ni una página web.";

const WEB_PAGE_REFUSAL_HINTS = {
  invalid_address: WHAT_ELSE_IS_NOT_READ,
  address_not_public: WHAT_ELSE_IS_NOT_READ,
  too_many_redirects: undefined,
  too_large: undefined,
  too_slow: undefined,
  unsupported_content: undefined,
  store_catalog_unavailable: undefined,
  unreachable: WHAT_ELSE_IS_NOT_READ,
} satisfies Record<WebPageRefusalReason, string | undefined>;

export function webPageRefusalMessage(reason: WebPageRefusalReason): string {
  return WEB_PAGE_REFUSAL_MESSAGES[reason];
}

export function webPageRefusalHint(reason: WebPageRefusalReason): string | undefined {
  return WEB_PAGE_REFUSAL_HINTS[reason];
}
