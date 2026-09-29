import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerBrandsListRoute } from "./brands-list-route.js";
import {
  insertBrand,
  insertProductOfBrand,
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
  registerBrandsListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function getBrands(rawSessionId: string | undefined, headers: Record<string, string> = {}) {
  return app.inject({
    method: "GET",
    url: "/brands",
    headers: { ...sessionCookie(rawSessionId), ...headers },
  });
}

describe("GET /brands", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getBrands(undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without the products and categories permission with 403 forbidden", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON, ["sell_and_charge"]);

    const response = await getBrands(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await getBrands(rawSessionId, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("lists every brand by name, active or not, with how many active products carry it", async () => {
    const granix = await insertBrand(db, { name: "Granix" });
    const litoral = await insertBrand(db, { name: "Yerba del Litoral", active: false, version: 3 });
    const cabrales = await insertBrand(db, { name: "Cabrales" });
    await insertProductOfBrand(db, { name: "Galletitas", brandId: granix.id });
    await insertProductOfBrand(db, { name: "Tostadas", brandId: granix.id });
    await insertProductOfBrand(db, { name: "Barritas", brandId: granix.id, active: false });
    await insertProductOfBrand(db, { name: "Miel", brandId: litoral.id });
    await insertProductOfBrand(db, { name: "Dátiles sueltos", brandId: null });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await getBrands(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: cabrales.id, name: "Cabrales", active: true, version: 1, productCount: 0 },
      { id: granix.id, name: "Granix", active: true, version: 1, productCount: 2 },
      { id: litoral.id, name: "Yerba del Litoral", active: false, version: 3, productCount: 1 },
    ]);
  });

  it("lists brands for an Administrator even without the explicit permission", async () => {
    await insertBrand(db, { name: "Granix" });
    const rawSessionId = await signedInAsAdministrator(db, NOON);

    const response = await getBrands(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ name: "Granix" }]);
  });
});
