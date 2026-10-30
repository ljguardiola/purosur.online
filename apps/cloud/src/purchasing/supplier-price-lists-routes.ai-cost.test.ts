import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerSupplierPriceListsRoutes } from "./supplier-price-lists-routes.js";
import { insertAiCall } from "./test-support/ai-call-fixtures.js";
import { extractedListWithRow } from "./test-support/extracted-list-fixtures.js";

const NOW = new Date("2026-10-16T15:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

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
  registerSupplierPriceListsRoutes(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

const aiCost = (headers: Record<string, string>, listId: string) =>
  app.inject({ method: "GET", url: `/supplier-price-lists/${listId}/ai-cost`, headers });

describe("GET /supplier-price-lists/:id/ai-cost access", () => {
  it("answers 401 when no session cookie was sent", async () => {
    const response = await aiCost({ origin: BACKOFFICE_ORIGIN }, MISSING_ID);

    expect(response.statusCode).toBe(401);
  });

  it("answers 403 to someone who reviews lists but may not change the branch's settings, even for a list that does not exist", async () => {
    const { headers } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);

    const response = await aiCost(headers, MISSING_ID);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers someone who may change the branch's settings", async () => {
    const { headers } = await signedInWith(db, ["configure_branch"], NOW);
    const { listId } = await extractedListWithRow(db);

    const response = await aiCost(headers, listId);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /supplier-price-lists/:id/ai-cost", () => {
  it("answers the cost of reading the list, of its proposals and their sum", async () => {
    const { headers, locationId } = await signedInWith(db, ["configure_branch"], NOW);
    const { listId, supplierId, actorId } = await extractedListWithRow(db);
    const seed = { listId, supplierId, locationId, actorId };
    await insertAiCall(db, { ...seed, costNanoUsd: 4_000_000 });
    await insertAiCall(db, { ...seed, purpose: "LINK_PROPOSAL", costNanoUsd: 1_000_000 });
    await insertAiCall(db, { ...seed, purpose: "LINK_PROPOSAL", costNanoUsd: null });

    const response = await aiCost(headers, listId);

    expect(response.json()).toEqual({
      reading: { costNanoUsd: 4_000_000, unpricedCalls: 0 },
      proposals: { costNanoUsd: 1_000_000, unpricedCalls: 1 },
      total: { costNanoUsd: 5_000_000, unpricedCalls: 1 },
    });
  });

  it("answers 404 for a list that does not exist", async () => {
    const { headers } = await signedInWith(db, ["configure_branch"], NOW);

    const response = await aiCost(headers, MISSING_ID);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 404 for a list of another branch", async () => {
    const { headers } = await signedInWith(db, ["configure_branch"], NOW, {
      locationId: await insertLocation(db),
    });
    const { listId } = await extractedListWithRow(db);

    const response = await aiCost(headers, listId);

    expect(response.statusCode).toBe(404);
  });
});
