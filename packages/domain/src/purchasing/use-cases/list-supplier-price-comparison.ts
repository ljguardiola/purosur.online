import type { SaleUnit } from "../../catalog/index.js";
import { compareSpanishText, type Fraction } from "../../shared/index.js";
import { cheapestOffer, compareFractions, pricePerSaleUnit } from "../model/supplier-item.js";
import type { SupplierPriceComparisonReader } from "./supplier-price-comparison-reader.js";

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

export interface ComparedProduct {
  id: string;
  name: string;
  categoryName: string;
  saleUnit: SaleUnit;
  // Cheapest first.
  offers: ComparedOffer[];
}

export async function listSupplierPriceComparison(
  reader: SupplierPriceComparisonReader,
): Promise<ComparedProduct[]> {
  const [products, offers] = await Promise.all([reader.activeProducts(), reader.offers()]);
  return [...products]
    .sort((a, b) => compareSpanishText(a.name, b.name) || compareSpanishText(a.id, b.id))
    .map((product) => {
      const priced = offers
        .filter((offer) => offer.productId === product.id)
        .flatMap((offer) => {
          const perSaleUnit = pricePerSaleUnit({
            priceCents: offer.priceCents,
            pricesIncludeVat: offer.pricesIncludeVat,
            vatRate: offer.vatRate,
            quantityPerPackage: offer.packaging.quantityPerPackage,
          });
          return perSaleUnit === null
            ? []
            : [
                {
                  supplier: offer.supplier,
                  packagingName: offer.packaging.name,
                  quantityPerPackage: offer.packaging.quantityPerPackage,
                  priceCents: offer.priceCents,
                  pricePerSaleUnit: perSaleUnit,
                  listDate: offer.listDate,
                },
              ];
        });
      const cheapest = cheapestOffer(priced);
      return {
        ...product,
        offers: priced
          .map((offer) => ({ ...offer, cheapest: offer === cheapest }))
          .sort((a, b) => compareFractions(a.pricePerSaleUnit, b.pricePerSaleUnit)),
      };
    });
}
