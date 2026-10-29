import { freightByPeriodSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerFreightByPeriodReportRoute } from "./freight-by-period-report-route.js";
import { registerFreightsRoutes } from "./freights-routes.js";
import { insertFreightRow, insertPurchaseWithLines } from "./test-support/freight-fixtures.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");

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
  const options = {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  };
  registerFreightByPeriodReportRoute(app, options);
  registerFreightsRoutes(app, options);
});

afterEach(async () => {
  await app.close();
});

function freightByPeriod(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/freight-by-period${query}`, headers });
}

async function freightAt(input: {
  locationId: string;
  actorId: string;
  date: string;
  amountCents: number;
}) {
  const { productId } = await insertProduct(db);
  const { purchaseId } = await insertPurchaseWithLines(db, {
    locationId: input.locationId,
    actorId: input.actorId,
    lines: [{ productId, costPaidCents: 1_000, quantity: 1_000, quantityPerPackage: 1_000 }],
  });
  await insertFreightRow(db, {
    locationId: input.locationId,
    actorId: input.actorId,
    purchaseIds: [purchaseId],
    date: input.date,
    amountCents: input.amountCents,
  });
}

describe("GET /reports/freight-by-period access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await freightByPeriod({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await freightByPeriod({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["manage_freight"], NOW);

    const response = await freightByPeriod(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await freightByPeriod(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/freight-by-period", () => {
  it("answers 400 to a range the contract refuses", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await freightByPeriod(headers, "?from=2026-10-09&to=2026-10-01");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await freightByPeriod(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-05", to: "2026-10-05" },
      months: [],
      totals: { freights: 0, amount: 0 },
    });
  });

  it("reports the freight of the branch of the session by month", async () => {
    const { headers, userId, locationId } = await signedInWith(db, ["view_reports"], NOW);
    await freightAt({ locationId, actorId: userId, date: "2026-09-30", amountCents: 3_000 });
    await freightAt({ locationId, actorId: userId, date: "2026-10-02", amountCents: 12_000 });
    await freightAt({ locationId, actorId: userId, date: "2026-10-04", amountCents: 500 });
    await freightAt({
      locationId: await insertLocation(db),
      actorId: userId,
      date: "2026-10-02",
      amountCents: 99_000,
    });

    const response = await freightByPeriod(headers, "?from=2026-09-01&to=2026-10-05");

    expect(freightByPeriodSchema.parse(response.json())).toEqual({
      range: { from: "2026-09-01", to: "2026-10-05" },
      months: [
        { month: "2026-09", freights: 1, amount: 3_000 },
        { month: "2026-10", freights: 2, amount: 12_500 },
      ],
      totals: { freights: 3, amount: 15_500 },
    });
  });

  it("includes a freight from the moment it is registered", async () => {
    const { headers, userId, locationId } = await signedInWith(
      db,
      ["view_reports", "manage_freight"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const { purchaseId } = await insertPurchaseWithLines(db, {
      locationId,
      actorId: userId,
      lines: [{ productId, costPaidCents: 1_000, quantity: 1_000, quantityPerPackage: 1_000 }],
    });
    const before = await freightByPeriod(headers, "?from=2026-10-04&to=2026-10-04");

    const registered = await app.inject({
      method: "POST",
      url: "/freights",
      headers,
      payload: {
        date: "2026-10-04",
        amountCents: 12_000,
        description: "Flete a la bodega",
        means: { kind: "carrier", name: "Transportes del Sur" },
        purchaseIds: [purchaseId],
      },
    });
    const after = await freightByPeriod(headers, "?from=2026-10-04&to=2026-10-04");

    expect(registered.statusCode).toBe(201);
    expect(before.json().totals).toEqual({ freights: 0, amount: 0 });
    expect(after.json().totals).toEqual({ freights: 1, amount: 12_000 });
  });
});
