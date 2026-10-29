import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { branchSettings, priceReviews, prices } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { registerPriceConfirmationRoute } from "./price-confirmation-route.js";
import { registerPricesPastReviewDeadlineReportRoute } from "./prices-past-review-deadline-report-route.js";
import { insertPriceReviewPostponement } from "./test-support/price-review-postponements.js";

const NOW = new Date("2026-03-10T15:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = Fastify();
  const options = {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    zoneRules: fixedZoneRulesSource(),
    now: () => NOW,
  };
  registerPricesPastReviewDeadlineReportRoute(app, options);
  registerPriceConfirmationRoute(app, options);
});

afterEach(async () => {
  await app.close();
});

function report(headers: Record<string, string>, query = "") {
  return app.inject({
    method: "GET",
    url: `/reports/prices-past-review-deadline${query}`,
    headers,
  });
}

function idsOf(body: { prices: { product: { id: string } }[] }): string[] {
  return body.prices.map(({ product }) => product.id);
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

async function priceProduct(
  productId: string,
  options: { unitPrice?: number; reviewedAt?: Date; userId?: string } = {},
): Promise<string> {
  const priceListId = await seededPriceListId(db);
  const [price] = await db
    .insert(prices)
    .values({
      productId,
      priceListId,
      unitPrice: options.unitPrice ?? 1_500,
      validFrom: daysAgo(90),
    })
    .returning({ id: prices.id });
  const priceId = price?.id as string;
  if (options.reviewedAt && options.userId) {
    await db.insert(priceReviews).values({
      productId,
      priceListId,
      priceId,
      actorId: options.userId,
      reviewedAt: options.reviewedAt,
    });
  }
  return priceId;
}

describe("GET /reports/prices-past-review-deadline access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await report({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await report({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it.each(["manage_prices_and_review", "view_stock_balances"] as const)(
    "rejects a user holding %s but not view_reports",
    async (permission) => {
      const { headers } = await signedInWith(db, [permission], NOW);

      const response = await report(headers);

      expect(response.statusCode).toBe(403);
    },
  );

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await report(headers);

    expect(response.statusCode).toBe(200);
  });

  it.each([
    ["a period that ends before it starts", "?from=2026-12-31&to=2026-12-01"],
    ["only one end of the period", "?from=2026-12-01"],
    ["a parameter given twice", "?from=2026-12-01&from=2026-12-02&to=2026-12-31"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await report(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /reports/prices-past-review-deadline", () => {
  it("answers an empty report for today and the branch's window when no price is pending", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await report(headers);

    expect(response.json()).toEqual({
      period: { from: "2026-03-10", to: "2026-03-10" },
      window_days: 30,
      prices: [],
      summary: { price_count: 0 },
    });
  });

  it("lists the overdue, postponed and never reviewed prices, never reviewed first and then the oldest", async () => {
    const { headers, userId, locationId } = await signedInWith(db, ["view_reports"], NOW);
    await db
      .update(branchSettings)
      .set({ unreviewedPriceAlertDays: 45 })
      .where(eq(branchSettings.locationId, locationId));
    const cheese = await insertProduct(db, {
      name: "Queso cremoso",
      categoryName: "Lácteos",
      saleUnit: "KG",
      brandName: "Vitora",
      netContent: { quantity: 250, unit: "G" },
    });
    const rice = await insertProduct(db, { name: "Arroz largo fino" });
    const oil = await insertProduct(db, { name: "Aceite de girasol" });
    const fresh = await insertProduct(db, { name: "Fideos" });
    const unpriced = await insertProduct(db, { name: "Yerba" });
    await priceProduct(cheese.productId, {
      unitPrice: 2_300,
      reviewedAt: new Date("2026-01-04T15:00:00.000Z"),
      userId,
    });
    await priceProduct(rice.productId, { reviewedAt: daysAgo(5), userId });
    await insertPriceReviewPostponement(db, {
      productId: rice.productId,
      actorId: userId,
      postponedAt: new Date("2026-03-07T15:00:00.000Z"),
    });
    await priceProduct(oil.productId);
    await priceProduct(fresh.productId, { reviewedAt: daysAgo(10), userId });

    const response = await report(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      period: { from: "2026-02-18", to: "2026-03-10" },
      window_days: 45,
      prices: [
        {
          product: {
            id: oil.productId,
            name: "Aceite de girasol",
            brand_name: null,
            net_content: null,
            category_id: oil.categoryId,
            category_name: "Almacén",
            sale_unit: "UNIT",
          },
          current_price: { unit_price_cents: 1_500, valid_from: daysAgo(90).toISOString() },
          last_reviewed_at: null,
          past_deadline_on: null,
          reason: "never_reviewed",
        },
        {
          product: {
            id: unpriced.productId,
            name: "Yerba",
            brand_name: null,
            net_content: null,
            category_id: unpriced.categoryId,
            category_name: "Almacén",
            sale_unit: "UNIT",
          },
          current_price: null,
          last_reviewed_at: null,
          past_deadline_on: null,
          reason: "never_reviewed",
        },
        {
          product: {
            id: cheese.productId,
            name: "Queso cremoso",
            brand_name: "Vitora",
            net_content: { quantity: 250, unit: "G" },
            category_id: cheese.categoryId,
            category_name: "Lácteos",
            sale_unit: "KG",
          },
          current_price: { unit_price_cents: 2_300, valid_from: daysAgo(90).toISOString() },
          last_reviewed_at: "2026-01-04T15:00:00.000Z",
          past_deadline_on: "2026-02-18",
          reason: "overdue",
        },
        {
          product: {
            id: rice.productId,
            name: "Arroz largo fino",
            brand_name: null,
            net_content: null,
            category_id: rice.categoryId,
            category_name: "Almacén",
            sale_unit: "UNIT",
          },
          current_price: { unit_price_cents: 1_500, valid_from: daysAgo(90).toISOString() },
          last_reviewed_at: daysAgo(5).toISOString(),
          past_deadline_on: "2026-03-07",
          reason: "postponed",
        },
      ],
      summary: { price_count: 4 },
    });
  });

  it("keeps the prices whose deadline day is within the period asked and every never reviewed one", async () => {
    const { headers, userId } = await signedInWith(db, ["view_reports"], NOW);
    const early = await insertProduct(db, { name: "Arroz" });
    const inside = await insertProduct(db, { name: "Fideos" });
    const late = await insertProduct(db, { name: "Sal" });
    const never = await insertProduct(db, { name: "Yerba" });
    await priceProduct(early.productId, {
      reviewedAt: new Date("2026-01-03T15:00:00.000Z"),
      userId,
    });
    await priceProduct(inside.productId, {
      reviewedAt: new Date("2026-01-20T15:00:00.000Z"),
      userId,
    });
    await priceProduct(late.productId, {
      reviewedAt: new Date("2026-02-04T15:00:00.000Z"),
      userId,
    });
    await priceProduct(never.productId);

    const response = await report(headers, "?from=2026-02-10&to=2026-02-20");

    expect(response.json()).toMatchObject({
      period: { from: "2026-02-10", to: "2026-02-20" },
      summary: { price_count: 2 },
    });
    expect(idsOf(response.json())).toEqual([never.productId, inside.productId]);
  });

  it("stops listing a price once it is confirmed, and lists a newly postponed one at once", async () => {
    const { headers, userId } = await signedInWith(
      db,
      ["view_reports", "manage_prices_and_review"],
      NOW,
    );
    const overdue = await insertProduct(db, { name: "Arroz" });
    const reviewed = await insertProduct(db, { name: "Fideos" });
    const overduePriceId = await priceProduct(overdue.productId, {
      reviewedAt: daysAgo(40),
      userId,
    });
    await priceProduct(reviewed.productId, { reviewedAt: daysAgo(2), userId });
    expect(idsOf((await report(headers)).json())).toEqual([overdue.productId]);

    await insertPriceReviewPostponement(db, {
      productId: reviewed.productId,
      actorId: userId,
      postponedAt: NOW,
    });
    expect(idsOf((await report(headers)).json())).toEqual([overdue.productId, reviewed.productId]);

    const confirmation = await app.inject({
      method: "POST",
      url: `/prices/${overdue.productId}/confirmations`,
      headers,
      payload: { expectedCurrentPriceId: overduePriceId },
    });

    expect(confirmation.statusCode).toBe(200);
    expect(idsOf((await report(headers)).json())).toEqual([reviewed.productId]);
  });
});
