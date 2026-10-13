import { type PriceCostReference, priceCostReference } from "../model/price-cost-reference.js";
import type {
  PriceReviewReader,
  PricesUnderReview,
  PricesUnderReviewQuery,
  PriceUnderReview,
} from "./price-review-reader.js";
import { costSourcesByProductId, type ProductCostPorts } from "./product-cost-sources.js";

export interface ListPricesPorts extends ProductCostPorts {
  reviews: PriceReviewReader;
}

export interface PricedProduct extends PriceUnderReview {
  costReference: PriceCostReference | null;
}

export interface ListedPrices extends Omit<PricesUnderReview, "products"> {
  products: PricedProduct[];
}

export async function listPrices(
  ports: ListPricesPorts,
  query: PricesUnderReviewQuery,
): Promise<ListedPrices> {
  const listing = await ports.reviews.pricesUnderReview(query);
  const sources = await costSourcesByProductId(
    ports,
    query.locationId,
    listing.products.map(({ id }) => id),
  );
  return {
    ...listing,
    products: listing.products.map((product) => ({
      ...product,
      costReference: priceCostReference(
        sources.get(product.id) ?? [],
        product.currentPrice?.unitPrice ?? null,
      ),
    })),
  };
}
