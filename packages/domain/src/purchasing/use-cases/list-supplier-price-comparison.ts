import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";
import {
  cheapestOffer,
  compareFractions,
  compareSpanishText,
  type Fraction,
} from "../../shared/index.js";
import type { SupplierOfferUnpricedReason } from "../model/supplier-item.js";
import { supplierOfferPrice } from "../model/supplier-offer.js";
import type {
  ComparableProduct,
  SupplierOffer,
  SupplierPriceComparisonReader,
} from "./supplier-price-comparison-reader.js";

export interface ComparedOffer {
  supplier: { id: string; name: string };
  // In thousandths of `saleUnit`.
  quantity: number;
  saleUnit: SaleUnit;
  priceCents: number;
  // Cents per sale unit with VAT, exact.
  pricePerSaleUnit: Fraction;
  listDate: string;
  cheapest: boolean;
}

export interface UnpricedOffer {
  supplier: { id: string; name: string };
  quantity: number;
  saleUnit: SaleUnit;
  priceCents: number;
  listDate: string;
  reason: SupplierOfferUnpricedReason;
}

export interface ComparedProduct extends ProductBrandAndNetContent {
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
    quantity: offer.link.quantity,
    saleUnit: offer.link.saleUnit,
    priceCents: offer.priceCents,
    listDate: offer.listDate,
  };
  const price = supplierOfferPrice(offer, product.saleUnit);
  return price.kind === "unpriced"
    ? { kind: "unpriced", offer: { ...shown, reason: price.reason } }
    : {
        kind: "priced",
        offer: {
          ...shown,
          pricePerSaleUnit: price.pricePerSaleUnit,
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
