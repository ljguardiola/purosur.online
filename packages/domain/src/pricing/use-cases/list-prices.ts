import type { ZoneRulesSource } from "../../shared/index.js";
import { type PriceCostReference, priceCostReference } from "../model/price-cost-reference.js";
import { priceReviewAt } from "../model/price-review.js";
import { priceReviewDeadlineOf } from "../model/price-review-deadline.js";
import type {
  PriceReviewFilter,
  PriceReviewReader,
  PricesUnderReview,
  PricesUnderReviewQuery,
  PriceUnderReview,
} from "./price-review-reader.js";
import { costSourcesByProductId, type ProductCostPorts } from "./product-cost-sources.js";

export interface ListPricesPorts extends ProductCostPorts {
  reviews: PriceReviewReader;
  zoneRules: ZoneRulesSource;
}

export interface PricedProduct extends PriceUnderReview {
  costReference: PriceCostReference | null;
}

export interface ListedPrices extends Omit<PricesUnderReview, "products"> {
  products: PricedProduct[];
}

export interface ListPricesQuery extends Omit<PricesUnderReviewQuery, "review"> {
  review: PriceReviewFilter;
}

async function overdueProductIds(ports: ListPricesPorts, query: ListPricesQuery) {
  const { products, reviewWindowDays } = await ports.reviews.priceReviewHistories(query.locationId);
  const rules = ports.zoneRules.zoneRules();
  const overdue = products.filter(
    ({ lastReviewedAt, earliestPostponedAt }) =>
      priceReviewAt({ lastReviewedAt, reviewPostponed: false }, query.now, reviewWindowDays)
        .pending &&
      priceReviewDeadlineOf({ lastReviewedAt, earliestPostponedAt }, reviewWindowDays, rules)
        .reason === "overdue",
  );
  const asked = query.productIds && new Set(query.productIds);
  return overdue.map(({ id }) => id).filter((id) => !asked || asked.has(id));
}

export async function listPrices(
  ports: ListPricesPorts,
  query: ListPricesQuery,
): Promise<ListedPrices> {
  const listing = await ports.reviews.pricesUnderReview(
    query.review === "overdue"
      ? { ...query, review: "pending", productIds: await overdueProductIds(ports, query) }
      : { ...query, review: query.review },
  );
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
        ports.zoneRules.zoneRules(),
      ),
    })),
  };
}
