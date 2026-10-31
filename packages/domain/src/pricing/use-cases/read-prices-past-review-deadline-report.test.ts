import { describe, expect, expectTypeOf, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import type { PriceReviewReader, ProductPriceReviewHistory } from "./price-review-reader.js";
import { readPricesPastReviewDeadlineReport } from "./read-prices-past-review-deadline-report.js";
import { fakePriceReviewReader } from "./test-support/fake-price-review-reader.js";
import { FixedClock } from "./test-support/fake-pricing-store.js";

const NOON = new Date("2026-03-10T15:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

function daysBefore(days: number, from: Date = NOON): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

function history(
  id: string,
  overrides: Partial<ProductPriceReviewHistory> = {},
): ProductPriceReviewHistory {
  return {
    id,
    name: `Producto ${id}`,
    categoryId: "category-1",
    categoryName: "Almacén",
    brandName: null,
    netContent: null,
    saleUnit: "UNIT",
    currentPrice: { id: `price-${id}`, unitPrice: 1_500, validFrom: daysBefore(60) },
    lastReviewedAt: daysBefore(40),
    earliestPostponedAt: null,
    ...overrides,
  };
}

async function read(
  products: ProductPriceReviewHistory[],
  options: {
    now?: Date;
    asked?: { from?: string; to?: string };
    reviewWindowDays?: number;
  } = {},
) {
  const reviews = fakePriceReviewReader(
    {
      products: [],
      categories: [],
      pendingCount: 0,
      activeProductCount: 0,
      reviewWindowDays: 0,
    },
    { products, reviewWindowDays: options.reviewWindowDays ?? WINDOW_DAYS },
  );
  const report = await readPricesPastReviewDeadlineReport(
    {
      reviews,
      clock: new FixedClock(options.now ?? NOON),
      zoneRules: new FakeZoneRulesSource(),
    },
    { locationId: "location-1", asked: options.asked ?? {} },
  );
  return { report, reviews };
}

function idsOf(report: { prices: { product: { id: string } }[] }): string[] {
  return report.prices.map(({ product }) => product.id);
}

describe("readPricesPastReviewDeadlineReport", () => {
  it("answers an empty report for today and the branch's window when no price is pending", async () => {
    const { report, reviews } = await read([history("fresh", { lastReviewedAt: daysBefore(5) })], {
      reviewWindowDays: 45,
    });

    expect(report).toEqual({
      period: { from: "2026-03-10", to: "2026-03-10" },
      windowDays: 45,
      prices: [],
      summary: { priceCount: 0 },
    });
    expect(reviews.historyReads).toEqual(["location-1"]);
  });

  it("lists an overdue price with its product, price, last review, deadline day and reason", async () => {
    const lastReviewedAt = daysBefore(40);
    const currentPrice = { id: "price-1", unitPrice: 2_300, validFrom: daysBefore(90) };
    const { report } = await read([
      history("queso", {
        name: "Queso cremoso",
        brandName: "Vitora",
        netContent: { quantity: 250, unit: "G" },
        categoryId: "category-dairy",
        categoryName: "Lácteos",
        saleUnit: "KG",
        currentPrice,
        lastReviewedAt,
      }),
    ]);

    expect(report.prices).toEqual([
      {
        product: {
          id: "queso",
          name: "Queso cremoso",
          brandName: "Vitora",
          netContent: { quantity: 250, unit: "G" },
          categoryId: "category-dairy",
          categoryName: "Lácteos",
          saleUnit: "KG",
        },
        currentPrice,
        lastReviewedAt,
        pastDeadlineOn: "2026-02-28",
        reason: "overdue",
      },
    ]);
    expect(report.summary).toEqual({ priceCount: 1 });
  });

  it("lists a postponed price with the day of its postponement even within the window", async () => {
    const { report } = await read([
      history("postponed", {
        lastReviewedAt: daysBefore(5),
        earliestPostponedAt: new Date("2026-03-07T12:00:00.000Z"),
      }),
    ]);

    expect(report.prices).toMatchObject([{ pastDeadlineOn: "2026-03-07", reason: "postponed" }]);
  });

  it("lists a price never reviewed or never priced without a day", async () => {
    const { report } = await read([
      history("never", { lastReviewedAt: null }),
      history("unpriced", { lastReviewedAt: null, currentPrice: null }),
    ]);

    expect(report.prices).toMatchObject([
      { pastDeadlineOn: null, reason: "never_reviewed", lastReviewedAt: null },
      { pastDeadlineOn: null, reason: "never_reviewed", currentPrice: null },
    ]);
  });

  it("does not list a price reviewed exactly the window ago, but lists one a moment older", async () => {
    const exactly = daysBefore(WINDOW_DAYS);
    const { report } = await read([
      history("exactly", { lastReviewedAt: exactly }),
      history("older", { lastReviewedAt: new Date(exactly.getTime() - 1) }),
    ]);

    expect(idsOf(report)).toEqual(["older"]);
  });

  it("uses the branch's window to decide which prices are overdue", async () => {
    const products = [history("p", { lastReviewedAt: daysBefore(20) })];

    expect(idsOf((await read(products, { reviewWindowDays: 30 })).report)).toEqual([]);
    expect(idsOf((await read(products, { reviewWindowDays: 10 })).report)).toEqual(["p"]);
  });

  it("orders the never-reviewed first, then the oldest day, then the name, then the id", async () => {
    const { report } = await read([
      history("recent", { lastReviewedAt: daysBefore(35) }),
      history("b-same-name", { name: "Sal", lastReviewedAt: daysBefore(50) }),
      history("a-same-name", { name: "Sal", lastReviewedAt: daysBefore(50) }),
      history("zeta", { name: "Zapallo", lastReviewedAt: null }),
      history("oldest", { lastReviewedAt: daysBefore(80) }),
      history("alpha", { name: "Ají", lastReviewedAt: null }),
      history("same-day-other-name", { name: "Arroz", lastReviewedAt: daysBefore(50) }),
    ]);

    expect(idsOf(report)).toEqual([
      "alpha",
      "zeta",
      "oldest",
      "same-day-other-name",
      "a-same-name",
      "b-same-name",
      "recent",
    ]);
  });

  it("orders prices of the same day and name whose ids differ only in letter case by their code units, uppercase first", async () => {
    const { report } = await read([
      history("sal", { name: "Sal fina", lastReviewedAt: daysBefore(50) }),
      history("SAL", { name: "Sal fina", lastReviewedAt: daysBefore(50) }),
    ]);

    expect(idsOf(report)).toEqual(["SAL", "sal"]);
  });

  it("answers, when no period is asked, the period from the earliest deadline day to today", async () => {
    const { report } = await read([
      history("recent", { lastReviewedAt: daysBefore(35) }),
      history("oldest", { lastReviewedAt: daysBefore(80) }),
      history("never", { lastReviewedAt: null }),
    ]);

    expect(report.period).toEqual({ from: "2026-01-19", to: "2026-03-10" });
    expect(idsOf(report)).toEqual(["never", "oldest", "recent"]);
  });

  it("keeps the prices whose deadline day is within the period asked, both ends included, and every never-reviewed one", async () => {
    const { report } = await read(
      [
        history("before", { lastReviewedAt: new Date("2026-01-04T12:00:00.000Z") }),
        history("first-day", { lastReviewedAt: new Date("2026-01-05T12:00:00.000Z") }),
        history("middle", { lastReviewedAt: new Date("2026-01-10T12:00:00.000Z") }),
        history("last-day", { lastReviewedAt: new Date("2026-01-15T12:00:00.000Z") }),
        history("after", { lastReviewedAt: new Date("2026-01-16T12:00:00.000Z") }),
        history("never", { lastReviewedAt: null }),
      ],
      { asked: { from: "2026-02-04", to: "2026-02-14" } },
    );

    expect(report.period).toEqual({ from: "2026-02-04", to: "2026-02-14" });
    expect(idsOf(report)).toEqual(["never", "first-day", "middle", "last-day"]);
    expect(report.summary).toEqual({ priceCount: 4 });
  });

  it("reads today in Argentina's calendar", async () => {
    const lateEvening = new Date("2026-03-11T01:00:00.000Z");

    const { report } = await read([], { now: lateEvening });

    expect(report.period).toEqual({ from: "2026-03-10", to: "2026-03-10" });
  });

  it("reads each deadline day with the zone rules in force", async () => {
    const reviews = fakePriceReviewReader(
      { products: [], categories: [], pendingCount: 0, activeProductCount: 0, reviewWindowDays: 0 },
      {
        products: [history("p", { lastReviewedAt: new Date("2026-01-06T01:00:00.000Z") })],
        reviewWindowDays: 10,
      },
    );

    const report = await readPricesPastReviewDeadlineReport(
      {
        reviews,
        clock: new FixedClock(NOON),
        zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
      },
      { locationId: "location-1", asked: {} },
    );

    expect(report.prices).toMatchObject([{ pastDeadlineOn: "2026-01-16" }]);
  });

  it("needs a reader that reads each priced product's review history", () => {
    expectTypeOf<Pick<PriceReviewReader, "pricesUnderReview">>().not.toExtend<
      Parameters<typeof readPricesPastReviewDeadlineReport>[0]["reviews"]
    >();
  });
});
