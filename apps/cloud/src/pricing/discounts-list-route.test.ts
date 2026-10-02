import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertProductWithTags,
  insertTag,
  sessionCookie,
  signedInAsAdministrator,
  signedInWithPermissions,
} from "../catalog/test-support/catalog-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerDiscountsListRoute } from "./discounts-list-route.js";
import {
  insertCategory,
  insertDiscount,
  OTHER_PERMISSIONS_THAN_PROMOTIONS,
} from "./test-support/discount-route-fixtures.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

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
  registerDiscountsListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function getDiscounts(rawSessionId: string | undefined, headers: Record<string, string> = {}) {
  return app.inject({
    method: "GET",
    url: "/discounts",
    headers: { ...sessionCookie(rawSessionId), ...headers },
  });
}

describe("GET /discounts", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getDiscounts(undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it.each(OTHER_PERMISSIONS_THAN_PROMOTIONS)(
    "rejects a user who only has %s with 403 forbidden",
    async (...permissionKeys) => {
      const rawSessionId = await signedInWithPermissions(db, NOON, permissionKeys);

      const response = await getDiscounts(rawSessionId);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "forbidden" });
    },
  );

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await getDiscounts(rawSessionId, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("lists nothing as an empty list", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await getDiscounts(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ discounts: [] });
  });

  it("lists every discount by name, active or not, each with the name of its target", async () => {
    const category = await insertCategory(db, "Infusiones");
    const tag = await insertTag(db, { name: "Sin TACC" });
    const product = await insertProductWithTags(db, { name: "Yerba mate", tagIds: [] });
    const onCategory = await insertDiscount(db, {
      name: "Martes de infusiones",
      categoryId: category,
      percent: 10,
      weekdays: [2],
    });
    const onTag = await insertDiscount(db, {
      name: "Semana sin TACC",
      tagId: tag.id,
      percent: 20,
      validFrom: "2026-11-01",
      validTo: "2026-11-07",
      active: false,
      version: 3,
    });
    const onProduct = await insertDiscount(db, {
      name: "Yerba en oferta",
      productId: product.id,
      percent: 5,
    });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await getDiscounts(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      discounts: [
        {
          id: onCategory.id,
          name: "Martes de infusiones",
          benefit: { kind: "PERCENT_OFF", percent: 10 },
          target: { kind: "CATEGORY", id: category, name: "Infusiones" },
          validFrom: "2026-10-01",
          validTo: "2026-10-31",
          weekdays: [2],
          active: true,
          version: 1,
          status: "scheduled",
        },
        {
          id: onTag.id,
          name: "Semana sin TACC",
          benefit: { kind: "PERCENT_OFF", percent: 20 },
          target: { kind: "TAG", id: tag.id, name: "Sin TACC" },
          validFrom: "2026-11-01",
          validTo: "2026-11-07",
          weekdays: [],
          active: false,
          version: 3,
          status: "deactivated",
        },
        {
          id: onProduct.id,
          name: "Yerba en oferta",
          benefit: { kind: "PERCENT_OFF", percent: 5 },
          target: { kind: "PRODUCT", id: product.id, name: "Yerba mate" },
          validFrom: "2026-10-01",
          validTo: "2026-10-31",
          weekdays: [],
          active: true,
          version: 1,
          status: "scheduled",
        },
      ],
    });
  });

  it("lists a buy-N-pay-M discount with its quantities", async () => {
    const product = await insertProductWithTags(db, { name: "Alfajor", tagIds: [] });
    const discount = await insertDiscount(db, {
      name: "Alfajores 3x2",
      productId: product.id,
      kind: "BUY_N_PAY_M",
      percent: null,
      buyQty: 3,
      payQty: 2,
    });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await getDiscounts(rawSessionId);

    expect(response.json()).toEqual({
      discounts: [
        {
          id: discount.id,
          name: "Alfajores 3x2",
          benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
          target: { kind: "PRODUCT", id: product.id, name: "Alfajor" },
          validFrom: "2026-10-01",
          validTo: "2026-10-31",
          weekdays: [],
          active: true,
          version: 1,
          status: "scheduled",
        },
      ],
    });
  });

  it("gives each discount its status on the clock's day", async () => {
    const category = await insertCategory(db, "Infusiones");
    await insertDiscount(db, {
      name: "A running",
      categoryId: category,
      validFrom: "2026-01-05",
      validTo: "2026-01-05",
    });
    await insertDiscount(db, {
      name: "B over",
      categoryId: category,
      validFrom: "2025-12-01",
      validTo: "2026-01-04",
    });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await getDiscounts(rawSessionId);

    expect(response.json().discounts.map(({ status }: { status: string }) => status)).toEqual([
      "current",
      "ended",
    ]);
  });

  it("lists discounts for an Administrator even without the explicit permission", async () => {
    const rawSessionId = await signedInAsAdministrator(db, NOON);

    const response = await getDiscounts(rawSessionId);

    expect(response.statusCode).toBe(200);
  });
});
