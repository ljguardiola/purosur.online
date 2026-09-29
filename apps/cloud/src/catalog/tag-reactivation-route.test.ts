import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { productTags, tags } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerTagReactivationRoute } from "./tag-reactivation-route.js";
import {
  insertProductWithTags,
  insertTag,
  sessionCookie,
  signedInAsAdministrator,
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
  registerTagReactivationRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function request(
  rawSessionId: string | undefined,
  id: string,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: `/tags/${id}/reactivation`,
    headers: { origin: BACKOFFICE_ORIGIN, ...sessionCookie(rawSessionId), ...headers },
    payload: {},
  });
}

async function storedTag(id: string) {
  const [tag] = await db.select().from(tags).where(eq(tags.id, id));
  return tag;
}

describe("POST /tags/:id/reactivation", () => {
  it("returns 401 unauthenticated when no cookie was sent, changing nothing", async () => {
    const tag = await insertTag(db, { name: "Sin TACC", active: false });

    const response = await request(undefined, tag.id);

    expect(response.statusCode).toBe(401);
    expect(await storedTag(tag.id)).toMatchObject({ active: false, version: 1 });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const tag = await insertTag(db, { name: "Sin TACC", active: false });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, tag.id, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedTag(tag.id)).toMatchObject({ active: false, version: 1 });
  });

  it("rejects a user without the products and categories permission with 403 forbidden, changing nothing", async () => {
    const tag = await insertTag(db, { name: "Sin TACC", active: false });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["sell_and_charge"]);

    const response = await request(rawSessionId, tag.id);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await storedTag(tag.id)).toMatchObject({ active: false, version: 1 });
  });

  it("reactivates the tag, bumping its version and leaving the products that carry it with it", async () => {
    const tag = await insertTag(db, { name: "Sin TACC", active: false });
    await insertProductWithTags(db, { name: "Galletitas", tagIds: [tag.id] });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, tag.id);

    expect(response.statusCode).toBe(200);
    expect(await storedTag(tag.id)).toMatchObject({ active: true, version: 2 });
    expect(await db.select().from(productTags)).toMatchObject([{ tagId: tag.id }]);
  });

  it("reactivates the tag for an Administrator even without the explicit permission", async () => {
    const tag = await insertTag(db, { name: "Sin TACC", active: false });
    const rawSessionId = await signedInAsAdministrator(db, NOON);

    const response = await request(rawSessionId, tag.id);

    expect(response.statusCode).toBe(200);
  });

  it("returns 409 tag_already_active for a tag already active, changing nothing", async () => {
    const tag = await insertTag(db, { name: "Sin TACC", active: true });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, tag.id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "tag_already_active" });
    expect(await storedTag(tag.id)).toMatchObject({ active: true, version: 1 });
  });

  it.each(["00000000-0000-0000-0000-000000000000", "not-a-uuid"])(
    "returns 404 not_found for the id %s",
    async (id) => {
      const rawSessionId = await signedInWithPermissions(db, NOON);

      const response = await request(rawSessionId, id);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    },
  );
});
