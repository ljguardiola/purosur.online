import type { SaleUnit } from "../../catalog/index.js";
import { cheapestOffer, type Fraction } from "../../shared/index.js";
import {
  isLinkCurrent,
  pricePerSaleUnit,
  type SupplierOfferUnpricedReason,
} from "./supplier-item.js";

interface PricedSupplierOffer {
  link: { quantity: number; saleUnit: SaleUnit; relinkRequired: boolean };
  priceCents: number;
  pricesIncludeVat: boolean | null;
  vatRate: number | null;
}

export type SupplierOfferPrice =
  | { kind: "priced"; pricePerSaleUnit: Fraction }
  | { kind: "unpriced"; reason: SupplierOfferUnpricedReason };

// Cents per sale unit, VAT included, exact; an offer whose link is outdated for the product, or
// whose VAT rate is missing, has none.
export function supplierOfferPrice(
  offer: PricedSupplierOffer,
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

// Of the items a supplier has linked to a product, the one an order takes: the cheapest per sale
// unit, or, when none has a comparable price, the first whose link is current.
export function supplierOfferToOrder<TOffer extends PricedSupplierOffer>(
  offers: readonly TOffer[],
  productSaleUnit: SaleUnit,
): TOffer | undefined {
  const priced = offers.flatMap((offer) => {
    const price = supplierOfferPrice(offer, productSaleUnit);
    return price.kind === "priced" ? [{ offer, pricePerSaleUnit: price.pricePerSaleUnit }] : [];
  });
  return (
    cheapestOffer(priced)?.offer ??
    offers.find((offer) => isLinkCurrent(offer.link, productSaleUnit))
  );
}

// The supplier's item an order line refers to: of the items linked at the line's quantity per
// package, the one an order takes.
export function supplierOfferOfOrderLine<TOffer extends PricedSupplierOffer>(
  offers: readonly TOffer[],
  productSaleUnit: SaleUnit,
  quantityPerPackage: number,
): TOffer | undefined {
  return supplierOfferToOrder(
    offers.filter((offer) => offer.link.quantity === quantityPerPackage),
    productSaleUnit,
  );
}
