import { aiCostByPeriodSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerAiCostByPeriodReportRoute } from "./ai-cost-by-period-report-route.js";
import { insertAiCall } from "./test-support/ai-call-fixtures.js";
import { extractedListWithRow } from "./test-support/extracted-list-fixtures.js";

const NOW = new Date("2026-10-20T15:00:00.000Z");

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
  registerAiCostByPeriodReportRoute(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function aiCostByPeriod(headers: Record<string, string>, query = "?group_by=supplier") {
  return app.inject({ method: "GET", url: `/reports/ai-cost-by-period${query}`, headers });
}

describe("GET /reports/ai-cost-by-period access", () => {
  it("answers 401 when no session cookie was sent", async () => {
    const response = await aiCostByPeriod({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["configure_branch"], NOW);

    const response = await aiCostByPeriod({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects someone who may view reports but not change the branch's settings", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await aiCostByPeriod(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers someone who may change the branch's settings", async () => {
    const { headers } = await signedInWith(db, ["configure_branch"], NOW);

    const response = await aiCostByPeriod(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/ai-cost-by-period", () => {
  it.each([
    ["a range the contract refuses", "?from=2026-10-09&to=2026-10-01&group_by=day"],
    ["a request without its grouping", "?from=2026-10-01&to=2026-10-09"],
    ["an unknown grouping", "?group_by=color"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["configure_branch"], NOW);

    const response = await aiCostByPeriod(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["configure_branch"], NOW);

    const response = await aiCostByPeriod(headers);

    expect(aiCostByPeriodSchema.parse(response.json())).toMatchObject({
      range: { from: "2026-10-20", to: "2026-10-20" },
      groups: [],
    });
  });

  it("reports the cost of the branch of the session by the grouping asked", async () => {
    const { headers, locationId } = await signedInWith(db, ["configure_branch"], NOW);
    const { listId, supplierId, actorId } = await extractedListWithRow(db);
    const seed = { listId, supplierId, locationId, actorId };
    await insertAiCall(db, { ...seed, occurredOn: "2026-10-12", costNanoUsd: 4_000_000 });
    await insertAiCall(db, {
      ...seed,
      purpose: "LINK_PROPOSAL",
      occurredOn: "2026-10-13",
      costNanoUsd: 1_000_000,
    });
    await insertAiCall(db, { ...seed, occurredOn: "2026-09-30", costNanoUsd: 9_000_000 });

    const response = await aiCostByPeriod(headers, "?from=2026-10-01&to=2026-10-31&group_by=day");

    expect(response.statusCode).toBe(200);
    const body = aiCostByPeriodSchema.parse(response.json());
    expect(body.range).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(body.groups.map((group) => group.key)).toEqual(["2026-10-12", "2026-10-13"]);
    expect(body.total.total).toEqual({ costNanoUsd: 5_000_000, unpricedCalls: 0 });
  });
});
