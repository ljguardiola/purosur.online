import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyReturn } from "../returns/test-support/applied-returns.js";
import { aSoldLine } from "../sales/test-support/sold-lines.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerLossesByReasonReportRoute } from "./losses-by-reason-report-route.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertMovement,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const NOW = new Date("2026-10-12T15:00:00.000Z");
const SOLD = new Date("2026-10-01T14:00:00.000Z");
const LOSS_DAY = new Date("2026-10-06T14:00:00.000Z");

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
  registerLossesByReasonReportRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    zoneRules: fixedZoneRulesSource(),
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function lossesReport(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/losses-by-reason${query}`, headers });
}

describe("GET /reports/losses-by-reason access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await lossesReport({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await lossesReport({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it.each(["manage_expiration_dates", "view_stock_balances"] as const)(
    "rejects a user holding %s but not view_reports",
    async (permission) => {
      const { headers } = await signedInWith(db, [permission], NOW);

      const response = await lossesReport(headers);

      expect(response.statusCode).toBe(403);
    },
  );

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await lossesReport(headers);

    expect(response.statusCode).toBe(200);
  });

  it.each([
    ["half a period", "?from=2026-10-01"],
    ["a period that ends before it starts", "?from=2026-10-31&to=2026-10-01"],
    ["a parameter given twice", "?from=2026-10-01&from=2026-10-02&to=2026-10-31"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await lossesReport(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /reports/losses-by-reason", () => {
  const range = "?from=2026-10-06&to=2026-10-06";

  it("answers today's Argentine day with no losses when nothing was lost", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await lossesReport(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-12", to: "2026-10-12" },
      reasons: [],
    });
  });

  it("answers the losses of the session's branch grouped by reason, as the wire describes them", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOW);
    const elsewhere = await insertLocation(db);
    const { productId } = await insertProduct(db, { name: "Almendras peladas", saleUnit: "KG" });
    const lose = (reason: string, delta: number, place = locationId) =>
      insertMovement(db, {
        productId,
        locationId: place,
        actorId: userId,
        kind: "loss",
        reason,
        delta,
        occurredAt: LOSS_DAY,
      });
    await lose("spoiled", -1_500);
    await lose("spoiled", -500);
    await lose("spoiled", -9_000, elsewhere);

    const response = await lossesReport(headers, range);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      range: { from: "2026-10-06", to: "2026-10-06" },
      reasons: [
        {
          reason: "spoiled",
          loss_count: 2,
          products: [
            {
              id: productId,
              name: "Almendras peladas",
              sale_unit: "KG",
              quantity: 2_000,
              loss_count: 2,
            },
          ],
        },
      ],
    });
  });

  it("includes a discarded return line from the moment its event is applied, beside a hand-recorded loss", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { deviceId } = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const { productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    await insertMovement(db, {
      productId,
      locationId,
      actorId: userId,
      kind: "loss",
      reason: "theft",
      delta: -1_000,
      occurredAt: LOSS_DAY,
    });
    const cashierId = randomUUID();
    await db
      .insert(users)
      .values({ id: cashierId, firstName: "Ana", email: "ana@example.com", locationId });

    const before = await lossesReport(headers, range);
    const yerba = aSoldLine(productId, "Yerba 1 kg", 2_000, 4_000);
    await applyReturn(db, {
      deviceId,
      soldAt: SOLD,
      returnedAt: LOSS_DAY,
      applyStock: true,
      sale: { actorId: cashierId, total: 4_000, lines: [yerba] },
      saleReturn: {
        actorId: cashierId,
        lines: [
          {
            saleLineId: yerba.id,
            productId,
            quantity: 2_000,
            reason: "defective",
            disposition: "discard",
            refundedAmount: 4_000,
          },
        ],
        stockMovements: [
          {
            id: randomUUID(),
            saleLineId: null,
            productId,
            kind: "loss",
            reason: null,
            delta: -2_000,
          },
        ],
      },
    });
    const after = await lossesReport(headers, range);

    expect(before.json().reasons.map(({ reason }: { reason: string }) => reason)).toEqual([
      "theft",
    ]);
    expect(
      after
        .json()
        .reasons.map(({ reason, products }: { reason: string; products: unknown[] }) => [
          reason,
          products,
        ]),
    ).toEqual([
      [
        "theft",
        [{ id: productId, name: "Yerba 1 kg", sale_unit: "UNIT", quantity: 1_000, loss_count: 1 }],
      ],
      [
        "return_discard",
        [{ id: productId, name: "Yerba 1 kg", sale_unit: "UNIT", quantity: 2_000, loss_count: 1 }],
      ],
    ]);
  });
});
