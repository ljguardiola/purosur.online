import {
  type CostSource,
  type PriceCostReference,
  priceCostReference,
} from "../model/price-cost-reference.js";
import type { PriceCostReader } from "./price-cost-reader.js";
import type {
  PriceReviewReader,
  PricesUnderReview,
  PricesUnderReviewQuery,
  PriceUnderReview,
} from "./price-review-reader.js";

export interface ListPricesPorts {
  reviews: PriceReviewReader;
  costs: PriceCostReader;
}

export interface PricedProduct extends PriceUnderReview {
  costReference: PriceCostReference | null;
}

export interface ListedPrices extends Omit<PricesUnderReview, "products"> {
  products: PricedProduct[];
}

export async function listPrices(
  { reviews, costs }: ListPricesPorts,
  query: PricesUnderReviewQuery,
): Promise<ListedPrices> {
  const listing = await reviews.pricesUnderReview(query);
  const found = await costs.costSourcesOf(
    query.locationId,
    listing.products.map(({ id }) => id),
  );
  const sourcesByProductId = new Map<string, CostSource[]>();
  for (const { productId, source } of found) {
    sourcesByProductId.set(productId, [...(sourcesByProductId.get(productId) ?? []), source]);
  }
  return {
    ...listing,
    products: listing.products.map((product) => ({
      ...product,
      costReference: priceCostReference(
        sourcesByProductId.get(product.id) ?? [],
        product.currentPrice?.unitPrice ?? null,
      ),
    })),
  };
}
