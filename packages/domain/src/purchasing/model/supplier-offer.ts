import type { SaleUnit } from "../../catalog/index.js";
import type { Fraction } from "../../shared/index.js";
import { mayBuyByPackaging } from "./packaging.js";
import { pricePerSaleUnit, type SupplierOfferUnpricedReason } from "./supplier-item.js";

export type SupplierOfferPrice =
  | { kind: "priced"; pricePerSaleUnit: Fraction }
  | { kind: "unpriced"; reason: SupplierOfferUnpricedReason };

// Cents per sale unit, VAT included, exact; an offer whose packaging cannot be bought for the
// product, or whose VAT rate is missing, has none.
export function supplierOfferPrice(
  offer: {
    packaging: { active: boolean; saleUnit: SaleUnit; quantityPerPackage: number };
    priceCents: number;
    pricesIncludeVat: boolean | null;
    vatRate: number | null;
  },
  productSaleUnit: SaleUnit,
): SupplierOfferPrice {
  if (!mayBuyByPackaging(offer.packaging, productSaleUnit)) {
    return { kind: "unpriced", reason: "packaging_not_buyable" };
  }
  const perSaleUnit = pricePerSaleUnit({
    priceCents: offer.priceCents,
    pricesIncludeVat: offer.pricesIncludeVat,
    vatRate: offer.vatRate,
    quantityPerPackage: offer.packaging.quantityPerPackage,
  });
  return perSaleUnit === null
    ? { kind: "unpriced", reason: "vat_rate_missing" }
    : { kind: "priced", pricePerSaleUnit: perSaleUnit };
}
