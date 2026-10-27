import type { SaleUnit } from "../../catalog/index.js";
import { compareSpanishText, type Fraction } from "../../shared/index.js";
import { mayBuyByPackaging } from "../model/packaging.js";
import {
  cheapestOffer,
  compareFractions,
  pricePerSaleUnit,
  type SupplierOfferUnpricedReason,
} from "../model/supplier-item.js";
import type {
  ComparableProduct,
  SupplierOffer,
  SupplierPriceComparisonReader,
} from "./supplier-price-comparison-reader.js";

export interface ComparedOffer {
  supplier: { id: string; name: string };
  packagingName: string;
  quantityPerPackage: number;
  priceCents: number;
  // Cents per sale unit with VAT, exact.
  pricePerSaleUnit: Fraction;
  listDate: string;
  cheapest: boolean;
}

export interface UnpricedOffer {
  supplier: { id: string; name: string };
  packagingName: string;
  priceCents: number;
  listDate: string;
  reason: SupplierOfferUnpricedReason;
}

export interface ComparedProduct {
  id: string;
  name: string;
  categoryName: string;
  saleUnit: SaleUnit;
  // Cheapest first.
  offers: ComparedOffer[];
  unpricedOffers: UnpricedOffer[];
}

type PricedOffer = Omit<ComparedOffer, "cheapest">;

function pricedOrUnpriced(
  offer: SupplierOffer,
  product: ComparableProduct,
): { kind: "priced"; offer: PricedOffer } | { kind: "unpriced"; offer: UnpricedOffer } {
  const shown = {
    supplier: offer.supplier,
    packagingName: offer.packaging.name,
    priceCents: offer.priceCents,
    listDate: offer.listDate,
  };
  if (!mayBuyByPackaging(offer.packaging, product.saleUnit)) {
    return { kind: "unpriced", offer: { ...shown, reason: "packaging_not_buyable" } };
  }
  const perSaleUnit = pricePerSaleUnit({
    priceCents: offer.priceCents,
    pricesIncludeVat: offer.pricesIncludeVat,
    vatRate: offer.vatRate,
    quantityPerPackage: offer.packaging.quantityPerPackage,
  });
  return perSaleUnit === null
    ? { kind: "unpriced", offer: { ...shown, reason: "vat_rate_missing" } }
    : {
        kind: "priced",
        offer: {
          ...shown,
          quantityPerPackage: offer.packaging.quantityPerPackage,
          pricePerSaleUnit: perSaleUnit,
        },
      };
}

export async function listSupplierPriceComparison(
  reader: SupplierPriceComparisonReader,
): Promise<ComparedProduct[]> {
  const [products, offers] = await Promise.all([reader.activeProducts(), reader.offers()]);
  return [...products]
    .sort((a, b) => compareSpanishText(a.name, b.name) || compareSpanishText(a.id, b.id))
    .map((product) => {
      const answered = offers
        .filter((offer) => offer.productId === product.id)
        .map((offer) => pricedOrUnpriced(offer, product));
      const priced = answered.flatMap((entry) => (entry.kind === "priced" ? [entry.offer] : []));
      const cheapest = cheapestOffer(priced);
      return {
        ...product,
        offers: priced
          .map((offer) => ({ ...offer, cheapest: offer === cheapest }))
          .sort((a, b) => compareFractions(a.pricePerSaleUnit, b.pricePerSaleUnit)),
        unpricedOffers: answered.flatMap((entry) =>
          entry.kind === "unpriced" ? [entry.offer] : [],
        ),
      };
    });
}
