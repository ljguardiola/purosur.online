import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentTransactions } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerMercadoPagoChargeCostsRoute } from "./mercado-pago-charge-costs-route.js";
import { insertRegister, pendingTransaction } from "./test-support/payment-transaction-fixtures.js";
import {
  insertSettlementMovements,
  settlementRow,
} from "./test-support/settlement-movement-fixtures.js";

const NOW = new Date("2026-10-09T15:00:00.000Z");

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
  registerMercadoPagoChargeCostsRoute(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function chargeCosts(headers: Record<string, string>, query = "") {
  return app.inject({
    method: "GET",
    url: `/reports/mercado-pago-charge-costs${query}`,
    headers,
  });
}

async function approvedCharge(registerId: string) {
  const transaction = pendingTransaction(registerId, { state: "APPROVED" });
  await db.insert(paymentTransactions).values(transaction);
  return transaction;
}

describe("GET /reports/mercado-pago-charge-costs access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await chargeCosts({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_mercado_pago_charge_costs"], NOW);

    const response = await chargeCosts({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may only view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await chargeCosts(headers);

    expect(response.statusCode).toBe(403);
  });

  it("rejects a user who may not view the charge costs before reading any data", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const registerId = await insertRegister(db, "Caja 1");
    await approvedCharge(registerId);

    const response = await chargeCosts(headers, "?from=2026-10-09&to=2026-10-08");

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view the charge costs", async () => {
    const { headers } = await signedInWith(db, ["view_mercado_pago_charge_costs"], NOW);

    const response = await chargeCosts(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/mercado-pago-charge-costs", () => {
  it.each([
    ["a range ending before it starts", "?from=2026-10-09&to=2026-10-08"],
    ["a parameter given twice", "?from=2026-10-01&from=2026-10-02&to=2026-10-03"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_mercado_pago_charge_costs"], NOW);

    const response = await chargeCosts(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day with nothing in it when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_mercado_pago_charge_costs"], NOW);

    const response = await chargeCosts(headers);

    expect(response.json()).toMatchObject({
      range: { from: "2026-10-09", to: "2026-10-09" },
      charges: [],
      days: [],
      totals: { charges_count: 0, pending_count: 0, net_amount: 0 },
    });
  });

  it("answers a charge with the cost its settlement movements carry", async () => {
    const { headers } = await signedInWith(db, ["view_mercado_pago_charge_costs"], NOW);
    const registerId = await insertRegister(db, "Caja 1");
    const charge = await approvedCharge(registerId);
    await insertSettlementMovements(db, [
      settlementRow({ sourceId: "PAY1", externalReference: charge.id }),
    ]);

    const response = await chargeCosts(headers);

    expect(response.json().charges).toEqual([
      {
        payment_transaction_id: charge.id,
        sale_id: charge.saleId,
        method: "QR",
        register_id: registerId,
        register_name: "Caja 1",
        amount: charge.amount,
        charged_at: charge.createdAt.toISOString(),
        cost: {
          gross_amount: 10_000,
          fee_amount: -450,
          financing_fee_amount: 0,
          taxes_amount: -90,
          net_amount: 9_460,
          money_release_date: null,
        },
      },
    ]);
    expect(response.json().totals).toMatchObject({ charges_count: 1, pending_count: 0 });
  });

  it("answers a charge whose settlement has not arrived as pending, without a cost", async () => {
    const { headers } = await signedInWith(db, ["view_mercado_pago_charge_costs"], NOW);
    const registerId = await insertRegister(db, "Caja 1");
    await approvedCharge(registerId);

    const response = await chargeCosts(headers);

    expect(response.json().charges).toMatchObject([{ cost: null }]);
    expect(response.json().totals).toMatchObject({ charges_count: 1, pending_count: 1 });
  });

  it("counts a settled charge that no payment of the system names as another charge", async () => {
    const { headers } = await signedInWith(db, ["view_mercado_pago_charge_costs"], NOW);
    await insertSettlementMovements(db, [settlementRow({ sourceId: "OTHER1" })]);

    const response = await chargeCosts(headers);

    expect(response.json().charges).toEqual([]);
    expect(response.json().methods).toMatchObject([{ method: "OTHER", charges_count: 1 }]);
    expect(response.json().totals).toMatchObject({ charges_count: 1, net_amount: 9_460 });
  });
});
