import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerTagsListRoute } from "./tags-list-route.js";
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
  registerTagsListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function getTags(rawSessionId: string | undefined, headers: Record<string, string> = {}) {
  return app.inject({
    method: "GET",
    url: "/tags",
    headers: { ...sessionCookie(rawSessionId), ...headers },
  });
}

describe("GET /tags", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getTags(undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without the products and categories permission with 403 forbidden", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON, ["sell_and_charge"]);

    const response = await getTags(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await getTags(rawSessionId, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("lists every tag by name, active or not, with how many active products carry it, one product carrying several tags counting for each", async () => {
    const sinTacc = await insertTag(db, { name: "Sin TACC" });
    const kosher = await insertTag(db, { name: "Kosher", active: false, version: 3 });
    const organico = await insertTag(db, { name: "Orgánico" });
    await insertProductWithTags(db, { name: "Galletitas", tagIds: [sinTacc.id] });
    await insertProductWithTags(db, { name: "Tostadas", tagIds: [sinTacc.id] });
    await insertProductWithTags(db, { name: "Barritas", tagIds: [sinTacc.id], active: false });
    await insertProductWithTags(db, { name: "Miel", tagIds: [kosher.id, sinTacc.id] });
    await insertProductWithTags(db, { name: "Dátiles sueltos", tagIds: [] });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await getTags(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: kosher.id, name: "Kosher", active: false, version: 3, productCount: 1 },
      { id: organico.id, name: "Orgánico", active: true, version: 1, productCount: 0 },
      { id: sinTacc.id, name: "Sin TACC", active: true, version: 1, productCount: 3 },
    ]);
  });

  it("lists tags for an Administrator even without the explicit permission", async () => {
    await insertTag(db, { name: "Sin TACC" });
    const rawSessionId = await signedInAsAdministrator(db, NOON);

    const response = await getTags(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ name: "Sin TACC" }]);
  });
});
