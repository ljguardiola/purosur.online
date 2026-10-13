import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertInitialCountLot } from "../stock/test-support/lot-fixtures.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerPriceMarginRoute } from "./price-margin-route.js";
import { insertPurchaseLine } from "./test-support/purchase-line-fixtures.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
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
  registerPriceMarginRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function marginRequest(productId: string, query: string, headers: Record<string, string>) {
  return app.inject({ method: "GET", url: `/prices/${productId}/margin?${query}`, headers });
}

describe("GET /prices/:productId/margin", () => {
  it("answers 401 unauthenticated when no cookie was sent", async () => {
    const { productId } = await insertProduct(db);

    const response = await marginRequest(productId, "unitPrice=2000", {
      origin: BACKOFFICE_ORIGIN,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["manage_prices_and_review"], NOON);
    const { productId } = await insertProduct(db);

    const response = await marginRequest(productId, "unitPrice=2000", {
      ...headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without the prices permission with 403 forbidden", async () => {
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOON);
    const { productId } = await insertProduct(db);

    const response = await marginRequest(productId, "unitPrice=2000", headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers the cost reference of the last purchase line with the margin of the typed price", async () => {
    const { headers, userId, locationId } = await signedInWith(
      db,
      ["manage_prices_and_review"],
      NOON,
    );
    const { productId } = await insertProduct(db);
    await insertPurchaseLine(db, {
      productId,
      locationId,
      actorId: userId,
      purchasedOn: "2026-01-02",
      recordedAt: new Date("2026-01-02T12:00:00.000Z"),
      costPaidCents: 1200,
      quantityPerPackage: 1_000,
    });

    const response = await marginRequest(productId, "unitPrice=2000", headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      costReference: {
        lastCostCents: 1200,
        freightPerUnitCents: 0,
        totalCostCents: 1200,
        marginTenthsOfPercent: 400,
      },
    });
  });

  it("answers the typed reference cost of an initial count when it is the only source", async () => {
    const { headers, userId, locationId } = await signedInWith(
      db,
      ["manage_prices_and_review"],
      NOON,
    );
    const { productId } = await insertProduct(db);
    await insertInitialCountLot(db, { productId, locationId, actorId: userId, unitCostCents: 700 });

    const response = await marginRequest(productId, "unitPrice=1000", headers);

    expect(response.json()).toEqual({
      costReference: {
        lastCostCents: 700,
        freightPerUnitCents: 0,
        totalCostCents: 700,
        marginTenthsOfPercent: 300,
      },
    });
  });

  it("answers a null cost reference for a product with no cost source, and ignores another branch's", async () => {
    const { headers, userId } = await signedInWith(db, ["manage_prices_and_review"], NOON);
    const { productId } = await insertProduct(db);
    await insertPurchaseLine(db, {
      productId,
      locationId: await insertLocation(db),
      actorId: userId,
      purchasedOn: "2026-01-02",
      recordedAt: new Date("2026-01-02T12:00:00.000Z"),
      costPaidCents: 1200,
      quantityPerPackage: 1_000,
    });

    const response = await marginRequest(productId, "unitPrice=2000", headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ costReference: null });
  });

  it("answers 404 not_found for a product that does not exist or is not active", async () => {
    const { headers } = await signedInWith(db, ["manage_prices_and_review"], NOON);
    const { productId: inactiveId } = await insertProduct(db, { active: false });

    for (const productId of [NO_PRODUCT_ID, inactiveId]) {
      const response = await marginRequest(productId, "unitPrice=2000", headers);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    }
  });

  it("answers 400 validation_failed naming productId when it is not an id", async () => {
    const { headers } = await signedInWith(db, ["manage_prices_and_review"], NOON);

    const response = await marginRequest("not-an-id", "unitPrice=2000", headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "productId" }],
    });
  });

  it.each(["", "unitPrice=0", "unitPrice=12.5", "unitPrice=abc", "unitPrice=-5"])(
    "answers 400 validation_failed naming unitPrice for the query %j",
    async (query) => {
      const { headers } = await signedInWith(db, ["manage_prices_and_review"], NOON);
      const { productId } = await insertProduct(db);

      const response = await marginRequest(productId, query, headers);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "validation_failed",
        message: "unitPrice must be a positive integer number of cents",
        details: [{ field: "unitPrice" }],
      });
    },
  );
});
