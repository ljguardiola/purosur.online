import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prices } from "../platform/db/schema.js";
import { insertAssemblyBatch } from "../stock/test-support/assembly-batch-fixtures.js";
import {
  BACKOFFICE_ORIGIN,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { registerPriceRecommendationRoute } from "./price-recommendation-route.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
const PRICE_START = new Date("2026-01-02T00:00:00.000Z");
const NO_PRODUCT_ID = "00000000-0000-4000-8000-000000000000";

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
  registerPriceRecommendationRoute(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function recommendationRequest(productId: string, query: string, headers: Record<string, string>) {
  return app.inject({
    method: "GET",
    url: `/prices/${productId}/recommendation?${query}`,
    headers,
  });
}

async function insertPrice(productId: string, unitPrice: number): Promise<string> {
  const [price] = await db
    .insert(prices)
    .values({
      productId,
      priceListId: await seededPriceListId(db),
      unitPrice,
      validFrom: PRICE_START,
    })
    .returning({ id: prices.id });
  if (!price) {
    throw new Error("test setup: seeding the price returned no row");
  }
  return price.id;
}

async function pricedMix() {
  const signedIn = await signedInWith(db, ["manage_recipes"], NOON);
  const { productId: mix } = await insertProduct(db, { name: "Mix", saleUnit: "KG" });
  const { productId: almonds } = await insertProduct(db, { name: "Almendras", saleUnit: "KG" });
  const { productId: raisins } = await insertProduct(db, { name: "Pasas", saleUnit: "KG" });
  await insertPrice(almonds, 2_000_000);
  await insertPrice(raisins, 1_000_000);
  return { ...signedIn, mix, almonds, raisins };
}

describe("GET /prices/:productId/recommendation", () => {
  it("answers 401 unauthenticated when no cookie was sent", async () => {
    const { productId } = await insertProduct(db);

    const response = await recommendationRequest(productId, `components=${NO_PRODUCT_ID}:600`, {
      origin: BACKOFFICE_ORIGIN,
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a user with the prices permission but not the recipes one with 403 forbidden", async () => {
    const { headers } = await signedInWith(db, ["manage_prices_and_review"], NOON);
    const { productId } = await insertProduct(db);

    const response = await recommendationRequest(
      productId,
      `components=${NO_PRODUCT_ID}:600`,
      headers,
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers the recommendation, the current price and the margin over the latest batch to a user who may edit recipes but not change prices", async () => {
    const { headers, userId, locationId, mix, almonds, raisins } = await pricedMix();
    const currentPriceId = await insertPrice(mix, 1_500_000);
    await insertAssemblyBatch(db, {
      productId: mix,
      locationId,
      actorId: userId,
      assembledAt: new Date("2026-01-04T12:00:00.000Z"),
      output: 1_000,
      cost: { totalCents: 1_200_000, quantity: 1_000 },
      costIncomplete: false,
    });

    const response = await recommendationRequest(
      mix,
      `components=${almonds}:600,${raisins}:400&unitPrice=1600000`,
      headers,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      currentPrice: {
        id: currentPriceId,
        unitPrice: 1_500_000,
        validFrom: PRICE_START.toISOString(),
      },
      recommendation: { kind: "recommended", unitPrice: 1_600_000 },
      batchCost: { kind: "known", unitCostCents: 1_200_000, marginTenthsOfPercent: 250 },
    });
  });

  it("names the components without a price and shows no batch cost", async () => {
    const { headers, mix, almonds } = await pricedMix();
    const { productId: unpriced } = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });

    const response = await recommendationRequest(
      mix,
      `components=${almonds}:600,${unpriced}:400`,
      headers,
    );

    expect(response.json()).toEqual({
      currentPrice: null,
      recommendation: { kind: "missing_prices", componentProductIds: [unpriced] },
      batchCost: { kind: "none" },
    });
  });

  it("answers 404 not_found for a product that does not exist or is not active", async () => {
    const { headers, almonds } = await pricedMix();
    const { productId: inactiveId } = await insertProduct(db, { name: "Viejo", active: false });

    for (const productId of [NO_PRODUCT_ID, inactiveId]) {
      const response = await recommendationRequest(productId, `components=${almonds}:600`, headers);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    }
  });

  it("answers 400 validation_failed naming components for a list the query shape refuses", async () => {
    const { headers, mix } = await pricedMix();

    const response = await recommendationRequest(mix, "components=nonsense", headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "components" }],
    });
  });

  it("answers 400 validation_failed naming productId when it is not an id", async () => {
    const { headers, almonds } = await pricedMix();

    const response = await recommendationRequest("not-an-id", `components=${almonds}:600`, headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ details: [{ field: "productId" }] });
  });

  it("answers 400 validation_failed naming unitPrice for a price the query shape refuses", async () => {
    const { headers, mix, almonds } = await pricedMix();

    const response = await recommendationRequest(
      mix,
      `components=${almonds}:600&unitPrice=0`,
      headers,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ details: [{ field: "unitPrice" }] });
  });
});
