import type { SaleUnit } from "../../catalog/index.js";
import type { Fraction } from "../../shared/index.js";
import {
  isLinkCurrent,
  pricePerSaleUnit,
  type SupplierOfferUnpricedReason,
} from "./supplier-item.js";

export type SupplierOfferPrice =
  | { kind: "priced"; pricePerSaleUnit: Fraction }
  | { kind: "unpriced"; reason: SupplierOfferUnpricedReason };

// Cents per sale unit, VAT included, exact; an offer whose link is outdated for the product, or
// whose VAT rate is missing, has none.
export function supplierOfferPrice(
  offer: {
    link: { quantity: number; saleUnit: SaleUnit; relinkRequired: boolean };
    priceCents: number;
    pricesIncludeVat: boolean | null;
    vatRate: number | null;
  },
  productSaleUnit: SaleUnit,
): SupplierOfferPrice {
  if (!isLinkCurrent(offer.link, productSaleUnit)) {
    return { kind: "unpriced", reason: "link_outdated" };
  }
  const perSaleUnit = pricePerSaleUnit({
    priceCents: offer.priceCents,
    pricesIncludeVat: offer.pricesIncludeVat,
    vatRate: offer.vatRate,
    quantity: offer.link.quantity,
  });
  return perSaleUnit === null
    ? { kind: "unpriced", reason: "vat_rate_missing" }
    : { kind: "priced", pricePerSaleUnit: perSaleUnit };
}
