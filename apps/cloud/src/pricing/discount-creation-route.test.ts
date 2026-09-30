import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertTag,
  sessionCookie,
  signedInWithPermissions,
} from "../catalog/test-support/catalog-route-fixtures.js";
import { discounts } from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerDiscountCreationRoute } from "./discount-creation-route.js";
import {
  insertCategory,
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
  registerDiscountCreationRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function createDiscount(
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: "/discounts",
    headers: { origin: BACKOFFICE_ORIGIN, ...sessionCookie(rawSessionId), ...headers },
    payload: body,
  });
}

function bodyAimedAt(target: { kind: string; id: string }) {
  return {
    name: " Martes de infusiones ",
    benefit: { kind: "PERCENT_OFF", percent: 10 },
    target,
    validFrom: "2026-10-01",
    validTo: "2026-10-31",
    weekdays: [4, 2],
  };
}

async function storedDiscounts() {
  return db.select().from(discounts);
}

describe("POST /discounts", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const category = await insertCategory(db, "Infusiones");

    const response = await createDiscount(
      undefined,
      bodyAimedAt({ kind: "CATEGORY", id: category }),
    );

    expect(response.statusCode).toBe(401);
    expect(await storedDiscounts()).toEqual([]);
  });

  it("rejects an Origin that is not the backoffice's own, creating nothing", async () => {
    const category = await insertCategory(db, "Infusiones");
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await createDiscount(
      rawSessionId,
      bodyAimedAt({ kind: "CATEGORY", id: category }),
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedDiscounts()).toEqual([]);
  });

  it.each(OTHER_PERMISSIONS_THAN_PROMOTIONS)(
    "rejects a user who only has %s with 403 forbidden, creating nothing",
    async (...permissionKeys) => {
      const category = await insertCategory(db, "Infusiones");
      const rawSessionId = await signedInWithPermissions(db, NOON, permissionKeys);

      const response = await createDiscount(
        rawSessionId,
        bodyAimedAt({ kind: "CATEGORY", id: category }),
      );

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "forbidden" });
      expect(await storedDiscounts()).toEqual([]);
    },
  );

  it("creates an active discount, answering it with its target's name", async () => {
    const category = await insertCategory(db, "Infusiones");
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await createDiscount(
      rawSessionId,
      bodyAimedAt({ kind: "CATEGORY", id: category }),
    );

    expect(response.statusCode).toBe(201);
    const [stored] = await storedDiscounts();
    expect(response.json()).toEqual({
      id: stored?.id,
      name: "Martes de infusiones",
      benefit: { kind: "PERCENT_OFF", percent: 10 },
      target: { kind: "CATEGORY", id: category, name: "Infusiones" },
      validFrom: "2026-10-01",
      validTo: "2026-10-31",
      weekdays: [2, 4],
      active: true,
      version: 1,
    });
    expect(await storedDiscounts()).toHaveLength(1);
  });

  it("rejects a body that does not match the shape with 400 validation_failed, creating nothing", async () => {
    const category = await insertCategory(db, "Infusiones");
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await createDiscount(rawSessionId, {
      ...bodyAimedAt({ kind: "CATEGORY", id: category }),
      name: "",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    expect(await storedDiscounts()).toEqual([]);
  });

  it("answers 409 discount_target_not_found for a target that is deactivated, creating nothing", async () => {
    const tag = await insertTag(db, { name: "Kosher", active: false });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await createDiscount(rawSessionId, bodyAimedAt({ kind: "TAG", id: tag.id }));

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "discount_target_not_found" });
    expect(await db.select().from(discounts).where(eq(discounts.tagId, tag.id))).toEqual([]);
  });

  it("logs the created discount as an insert of its first version, for every branch", async () => {
    const category = await insertCategory(db, "Infusiones");
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);
    const mark = await lastLoggedChangeSeq(db);

    const response = await createDiscount(
      rawSessionId,
      bodyAimedAt({ kind: "CATEGORY", id: category }),
    );

    expect(await changesLoggedAfter(db, mark)).toEqual([
      {
        entity: "discount",
        entityId: response.json().id,
        version: 1,
        op: "insert",
        locationId: null,
      },
    ]);
  });

  it("logs nothing for a discount refused because its target is deactivated", async () => {
    const tag = await insertTag(db, { name: "Kosher", active: false });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);
    const mark = await lastLoggedChangeSeq(db);

    await createDiscount(rawSessionId, bodyAimedAt({ kind: "TAG", id: tag.id }));

    expect(await changesLoggedAfter(db, mark)).toEqual([]);
  });
});
