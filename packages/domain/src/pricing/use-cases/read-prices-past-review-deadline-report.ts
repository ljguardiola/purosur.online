import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";
import {
  argentinaCalendarDay,
  type Clock,
  compareSpanishText,
  type ReportPeriod,
  type ZoneRulesSource,
} from "../../shared/index.js";
import { priceReviewAt } from "../model/price-review.js";
import {
  type PriceReviewPendingReason,
  priceReviewDeadlineOf,
  pricesPastDeadlinePeriodOf,
} from "../model/price-review-deadline.js";
import type { PriceReviewReader } from "./price-review-reader.js";
import type { CurrentPrice } from "./pricing-store.js";

export interface ReadPricesPastReviewDeadlineReportInput {
  locationId: string;
  asked: { from?: string; to?: string };
}

export interface PriceAwaitingReviewProduct extends ProductBrandAndNetContent {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  saleUnit: SaleUnit;
}

export interface PriceAwaitingReview {
  product: PriceAwaitingReviewProduct;
  currentPrice: CurrentPrice | null;
  lastReviewedAt: Date | null;
  pastDeadlineOn: string | null;
  reason: PriceReviewPendingReason;
}

export interface PricesPastReviewDeadlineReport {
  period: ReportPeriod;
  windowDays: number;
  prices: PriceAwaitingReview[];
  summary: { priceCount: number };
}

function compareAwaitingReview(a: PriceAwaitingReview, b: PriceAwaitingReview): number {
  if (a.pastDeadlineOn !== b.pastDeadlineOn) {
    if (a.pastDeadlineOn === null) {
      return -1;
    }
    if (b.pastDeadlineOn === null) {
      return 1;
    }
    return a.pastDeadlineOn.localeCompare(b.pastDeadlineOn);
  }
  return (
    compareSpanishText(a.product.name, b.product.name) || a.product.id.localeCompare(b.product.id)
  );
}

export async function readPricesPastReviewDeadlineReport(
  {
    reviews,
    clock,
    zoneRules,
  }: { reviews: PriceReviewReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked }: ReadPricesPastReviewDeadlineReportInput,
): Promise<PricesPastReviewDeadlineReport> {
  const now = clock.now();
  const rules = zoneRules.zoneRules();
  const today = argentinaCalendarDay(now, rules);
  const { products, reviewWindowDays } = await reviews.priceReviewHistories(locationId);
  const pending = products
    .filter(
      ({ lastReviewedAt, earliestPostponedAt }) =>
        priceReviewAt(
          { lastReviewedAt, reviewPostponed: earliestPostponedAt !== null },
          now,
          reviewWindowDays,
        ).pending,
    )
    .map(
      ({ lastReviewedAt, earliestPostponedAt, currentPrice, ...product }): PriceAwaitingReview => ({
        product,
        currentPrice,
        lastReviewedAt,
        ...priceReviewDeadlineOf({ lastReviewedAt, earliestPostponedAt }, reviewWindowDays, rules),
      }),
    );
  const period = pricesPastDeadlinePeriodOf(
    asked,
    pending.map(({ pastDeadlineOn }) => pastDeadlineOn),
    today,
  );
  const prices = pending
    .filter(
      ({ pastDeadlineOn }) =>
        pastDeadlineOn === null || (pastDeadlineOn >= period.from && pastDeadlineOn <= period.to),
    )
    .sort(compareAwaitingReview);
  return {
    period,
    windowDays: reviewWindowDays,
    prices,
    summary: { priceCount: prices.length },
  };
}
