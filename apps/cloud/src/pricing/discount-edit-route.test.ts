import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertProductWithTags,
  insertTag,
  sessionCookie,
  signedInWithPermissions,
} from "../catalog/test-support/catalog-route-fixtures.js";
import { discounts } from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerDiscountEditRoute } from "./discount-edit-route.js";
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
  registerDiscountEditRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function editDiscount(
  rawSessionId: string | undefined,
  id: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "PUT",
    url: `/discounts/${id}`,
    headers: { origin: BACKOFFICE_ORIGIN, ...sessionCookie(rawSessionId), ...headers },
    payload: body,
  });
}

function editBodyAimedAt(
  target: { kind: string; id: string },
  changes: Record<string, unknown> = {},
) {
  return {
    name: " Semana de las infusiones ",
    benefit: { kind: "PERCENT_OFF", percent: 25 },
    target,
    validFrom: "2026-11-01",
    validTo: "2026-11-30",
    weekdays: [6, 7],
    active: false,
    version: 1,
    ...changes,
  };
}

async function storedDiscount(id: string) {
  const [discount] = await db.select().from(discounts).where(eq(discounts.id, id));
  return discount;
}

describe("PUT /discounts/:id", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const category = await insertCategory(db, "Infusiones");
    const discount = await insertDiscount(db, { categoryId: category });

    const response = await editDiscount(
      undefined,
      discount.id,
      editBodyAimedAt({ kind: "CATEGORY", id: category }),
    );

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const category = await insertCategory(db, "Infusiones");
    const discount = await insertDiscount(db, { categoryId: category });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt({ kind: "CATEGORY", id: category }),
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedDiscount(discount.id)).toMatchObject({ percent: 15, version: 1 });
  });

  it.each(OTHER_PERMISSIONS_THAN_PROMOTIONS)(
    "rejects a user who only has %s with 403 forbidden, changing nothing",
    async (...permissionKeys) => {
      const category = await insertCategory(db, "Infusiones");
      const discount = await insertDiscount(db, { categoryId: category });
      const rawSessionId = await signedInWithPermissions(db, NOON, permissionKeys);

      const response = await editDiscount(
        rawSessionId,
        discount.id,
        editBodyAimedAt({ kind: "CATEGORY", id: category }),
      );

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "forbidden" });
      expect(await storedDiscount(discount.id)).toMatchObject({ percent: 15, version: 1 });
    },
  );

  it("changes every field of the discount, answering it with its target's name", async () => {
    const category = await insertCategory(db, "Infusiones");
    const tag = await insertTag(db, { name: "Sin TACC" });
    const discount = await insertDiscount(db, { categoryId: category });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt({ kind: "TAG", id: tag.id }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: discount.id,
      name: "Semana de las infusiones",
      benefit: { kind: "PERCENT_OFF", percent: 25 },
      target: { kind: "TAG", id: tag.id, name: "Sin TACC" },
      validFrom: "2026-11-01",
      validTo: "2026-11-30",
      weekdays: [6, 7],
      active: false,
      version: 2,
      status: "deactivated",
    });
    expect(await storedDiscount(discount.id)).toMatchObject({
      categoryId: null,
      tagId: tag.id,
      active: false,
      version: 2,
    });
  });

  it.each(["00000000-0000-0000-0000-000000000000"])(
    "returns 404 not_found for the id %s",
    async (id) => {
      const category = await insertCategory(db, "Infusiones");
      const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

      const response = await editDiscount(
        rawSessionId,
        id,
        editBodyAimedAt({ kind: "CATEGORY", id: category }),
      );

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    },
  );

  it("answers 400 validation_failed naming id for a malformed id, changing nothing", async () => {
    const category = await insertCategory(db, "Infusiones");
    const discount = await insertDiscount(db, { categoryId: category });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(
      rawSessionId,
      "not-a-uuid",
      editBodyAimedAt({ kind: "CATEGORY", id: category }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
    expect(await storedDiscount(discount.id)).toMatchObject({ active: true, version: 1 });
  });

  it("returns 404 not_found for an unknown id before it looks at a body that does not match the shape", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(rawSessionId, "00000000-0000-0000-0000-000000000000", {
      name: 42,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers an edited discount that is running on the clock's day as current", async () => {
    const category = await insertCategory(db, "Infusiones");
    const discount = await insertDiscount(db, { categoryId: category });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt(
        { kind: "CATEGORY", id: category },
        { validFrom: "2026-01-05", validTo: "2026-01-05", active: true },
      ),
    );

    expect(response.json()).toMatchObject({ status: "current" });
  });

  it("rejects a body that does not match the shape with 400 validation_failed, changing nothing", async () => {
    const category = await insertCategory(db, "Infusiones");
    const discount = await insertDiscount(db, { categoryId: category });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt({ kind: "CATEGORY", id: category }, { active: "yes" }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "active" }],
    });
    expect(await storedDiscount(discount.id)).toMatchObject({ active: true, version: 1 });
  });

  it("returns 409 stale_version for a save made over a version someone else already changed, changing nothing", async () => {
    const category = await insertCategory(db, "Infusiones");
    const discount = await insertDiscount(db, { categoryId: category, version: 2 });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt({ kind: "CATEGORY", id: category }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    expect(await storedDiscount(discount.id)).toMatchObject({ percent: 15, version: 2 });
  });

  it("answers 409 discount_target_not_found for a new target that is deactivated, changing nothing", async () => {
    const category = await insertCategory(db, "Infusiones");
    const tag = await insertTag(db, { name: "Kosher", active: false });
    const discount = await insertDiscount(db, { categoryId: category });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt({ kind: "TAG", id: tag.id }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "discount_target_not_found" });
    expect(await storedDiscount(discount.id)).toMatchObject({ categoryId: category, version: 1 });
  });

  it("answers 409 discount_target_not_sold_by_unit for a switch to buy-N-pay-M on a product sold by weight, changing nothing", async () => {
    const product = await insertProductWithTags(db, {
      name: "Queso cremoso",
      tagIds: [],
      saleUnit: "KG",
    });
    const discount = await insertDiscount(db, { productId: product.id });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt(
        { kind: "PRODUCT", id: product.id },
        { benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } },
      ),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "discount_target_not_sold_by_unit" });
    expect(await storedDiscount(discount.id)).toMatchObject({
      kind: "PERCENT_OFF",
      percent: 15,
      version: 1,
    });
  });

  it("answers 409 discount_product_sold_by_weight naming the product when switching a buy-N-pay-M discount back on, changing nothing", async () => {
    const product = await insertProductWithTags(db, {
      name: "Queso cremoso",
      tagIds: [],
      saleUnit: "KG",
    });
    const discount = await insertDiscount(db, {
      productId: product.id,
      kind: "BUY_N_PAY_M",
      percent: null,
      buyQty: 3,
      payQty: 2,
      validFrom: "2026-01-01",
      validTo: "2026-01-31",
      active: false,
    });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt(
        { kind: "PRODUCT", id: product.id },
        {
          benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
          validFrom: "2026-01-01",
          validTo: "2026-01-31",
          active: true,
        },
      ),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "discount_product_sold_by_weight",
      message: "a buy-N-pay-M discount cannot be live while its product is sold by weight",
      productName: "Queso cremoso",
    });
    expect(await storedDiscount(discount.id)).toMatchObject({ active: false, version: 1 });
  });

  it("switches a discount to buy-N-pay-M on a product sold by the unit", async () => {
    const product = await insertProductWithTags(db, { name: "Alfajor", tagIds: [] });
    const discount = await insertDiscount(db, { productId: product.id });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt(
        { kind: "PRODUCT", id: product.id },
        { benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } },
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
      version: 2,
    });
  });

  it("logs an edit as an update of the next version, for every branch", async () => {
    const category = await insertCategory(db, "Infusiones");
    const discount = await insertDiscount(db, { categoryId: category });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);
    const mark = await lastLoggedChangeSeq(db);

    await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt({ kind: "CATEGORY", id: category }),
    );

    expect(await changesLoggedAfter(db, mark)).toEqual([
      { entity: "discount", entityId: discount.id, version: 2, op: "update", locationId: null },
    ]);
  });

  it("logs switching a discount off and back on as one update each", async () => {
    const category = await insertCategory(db, "Infusiones");
    const discount = await insertDiscount(db, { categoryId: category });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);
    const mark = await lastLoggedChangeSeq(db);
    const target = { kind: "CATEGORY", id: category };

    await editDiscount(rawSessionId, discount.id, editBodyAimedAt(target, { active: false }));
    await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt(target, { active: true, version: 2 }),
    );

    expect(await changesLoggedAfter(db, mark)).toEqual([
      { entity: "discount", entityId: discount.id, version: 2, op: "update", locationId: null },
      { entity: "discount", entityId: discount.id, version: 3, op: "update", locationId: null },
    ]);
  });

  it("logs a change of a buy-N-pay-M discount's quantities as an update of the next version", async () => {
    const product = await insertProductWithTags(db, { name: "Alfajor", tagIds: [] });
    const discount = await insertDiscount(db, {
      productId: product.id,
      kind: "BUY_N_PAY_M",
      percent: null,
      buyQty: 3,
      payQty: 2,
    });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);
    const mark = await lastLoggedChangeSeq(db);

    await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt(
        { kind: "PRODUCT", id: product.id },
        { benefit: { kind: "BUY_N_PAY_M", buyQty: 4, payQty: 3 } },
      ),
    );

    expect(await changesLoggedAfter(db, mark)).toEqual([
      { entity: "discount", entityId: discount.id, version: 2, op: "update", locationId: null },
    ]);
  });

  it("logs nothing for an edit refused as stale", async () => {
    const category = await insertCategory(db, "Infusiones");
    const discount = await insertDiscount(db, { categoryId: category });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);
    const mark = await lastLoggedChangeSeq(db);

    await editDiscount(
      rawSessionId,
      discount.id,
      editBodyAimedAt({ kind: "CATEGORY", id: category }, { version: 9 }),
    );

    expect(await changesLoggedAfter(db, mark)).toEqual([]);
  });

  it("logs nothing for an edit refused because its new target is deactivated", async () => {
    const category = await insertCategory(db, "Infusiones");
    const tag = await insertTag(db, { name: "Kosher", active: false });
    const discount = await insertDiscount(db, { categoryId: category });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);
    const mark = await lastLoggedChangeSeq(db);

    await editDiscount(rawSessionId, discount.id, editBodyAimedAt({ kind: "TAG", id: tag.id }));

    expect(await changesLoggedAfter(db, mark)).toEqual([]);
  });
});
