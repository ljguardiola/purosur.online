import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { tags } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerTagEditRoute } from "./tag-edit-route.js";
import {
  insertProductWithTags,
  insertTag,
  sessionCookie,
  signedInWithPermissions,
} from "./test-support/catalog-route-fixtures.js";

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
  registerTagEditRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function editTag(
  rawSessionId: string | undefined,
  id: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "PUT",
    url: `/tags/${id}`,
    headers: { origin: BACKOFFICE_ORIGIN, ...sessionCookie(rawSessionId), ...headers },
    payload: body,
  });
}

async function storedTag(id: string) {
  const [tag] = await db.select().from(tags).where(eq(tags.id, id));
  return tag;
}

describe("PUT /tags/:id", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const tag = await insertTag(db, { name: "Sin TACC" });

    const response = await editTag(undefined, tag.id, { name: "Sin TACC Pro", version: 1 });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const tag = await insertTag(db, { name: "Sin TACC" });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editTag(
      rawSessionId,
      tag.id,
      { name: "Sin TACC Pro", version: 1 },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedTag(tag.id)).toMatchObject({ name: "Sin TACC", version: 1 });
  });

  it("rejects a user without the products and categories permission with 403 forbidden, changing nothing", async () => {
    const tag = await insertTag(db, { name: "Sin TACC" });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["sell_and_charge"]);

    const response = await editTag(rawSessionId, tag.id, { name: "Sin TACC Pro", version: 1 });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await storedTag(tag.id)).toMatchObject({ name: "Sin TACC", version: 1 });
  });

  it("renames the tag, answering it with its active products count", async () => {
    const tag = await insertTag(db, { name: "Sin TACC" });
    await insertProductWithTags(db, { name: "Galletitas", tagIds: [tag.id] });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editTag(rawSessionId, tag.id, { name: " Sin TACC Pro ", version: 1 });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: tag.id,
      name: "Sin TACC Pro",
      active: true,
      version: 2,
      productCount: 1,
    });
    expect(await storedTag(tag.id)).toMatchObject({ name: "Sin TACC Pro", version: 2 });
  });

  it.each(["00000000-0000-0000-0000-000000000000", "not-a-uuid"])(
    "returns 404 not_found for the id %s",
    async (id) => {
      const rawSessionId = await signedInWithPermissions(db, NOON);

      const response = await editTag(rawSessionId, id, { name: "Sin TACC", version: 1 });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    },
  );

  it.each(["00000000-0000-0000-0000-000000000000", "not-a-uuid"])(
    "returns 400 validation_failed for the id %s when the body does not match its shape",
    async (id) => {
      const rawSessionId = await signedInWithPermissions(db, NOON);

      const response = await editTag(rawSessionId, id, { name: "", version: 1 });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "validation_failed",
        details: [{ field: "name" }],
      });
    },
  );

  it("answers a tag renamed through its id in uppercase with the id as stored", async () => {
    const tag = await insertTag(db, { name: "Sin TACC" });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editTag(rawSessionId, tag.id.toUpperCase(), {
      name: "Sin gluten",
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: tag.id, name: "Sin gluten", version: 2 });
  });

  it("rejects an empty name, changing nothing", async () => {
    const tag = await insertTag(db, { name: "Sin TACC" });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editTag(rawSessionId, tag.id, { name: "", version: 1 });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
  });

  it("rejects a name another tag already has in another letter case with 409 tag_name_taken", async () => {
    const tag = await insertTag(db, { name: "Sin TACC" });
    await insertTag(db, { name: "Vegano" });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editTag(rawSessionId, tag.id, { name: "VEGANO", version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "tag_name_taken" });
    expect(await storedTag(tag.id)).toMatchObject({ name: "Sin TACC", version: 1 });
  });

  it("returns 409 stale_version for a save made over a version someone else already changed", async () => {
    const tag = await insertTag(db, { name: "Sin TACC", version: 2 });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editTag(rawSessionId, tag.id, { name: "Sin TACC Pro", version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    expect(await storedTag(tag.id)).toMatchObject({ name: "Sin TACC", version: 2 });
  });
});
