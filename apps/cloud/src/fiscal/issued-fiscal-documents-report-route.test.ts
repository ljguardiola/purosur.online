import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerIssuedFiscalDocumentsReportRoute } from "./issued-fiscal-documents-report-route.js";
import {
  insertCaeaDocument,
  insertOnlineCreditNote,
  insertReceiptRequest,
  insertRegisterOf,
} from "./test-support/issued-document-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");

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
  registerIssuedFiscalDocumentsReportRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    zoneRules: fixedZoneRulesSource(),
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function report(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/fiscal-documents${query}`, headers });
}

describe("GET /reports/fiscal-documents access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await report({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await report({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports, even one who may view fiscal documents", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await report(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await report(headers);

    expect(response.statusCode).toBe(200);
  });

  it("answers 400 to half a period", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await report(headers, "?from=2026-10-01");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /reports/fiscal-documents", () => {
  const range = "?from=2026-10-01&to=2026-10-31";

  it("answers an empty report when the branch issued nothing", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await report(headers, range);

    expect(response.json()).toEqual({
      range: { from: "2026-10-01", to: "2026-10-31" },
      rows: [],
      totals: {
        receipts: { count: 0, amount: 0 },
        credit_notes: { count: 0, amount: 0 },
        amount: 0,
        contingency: { count: 0, share_tenths_of_percent: null },
      },
    });
  });

  it("answers a row for each type, point of sale and authorization kind, with the credit note subtracting", async () => {
    const { headers, locationId } = await signedInWith(db, ["view_reports"], NOW);
    const registerId = await insertRegisterOf(db, locationId, "Caja 1");
    await insertReceiptRequest(db, registerId, { pointOfSale: 7, total: 6_000 });
    await insertCaeaDocument(db, registerId, { pointOfSale: 8, total: 2_000 });
    await insertOnlineCreditNote(db, registerId, { pointOfSale: 7, total: 1_500 });

    const response = await report(headers, range);

    expect(response.json()).toEqual({
      range: { from: "2026-10-01", to: "2026-10-31" },
      rows: [
        {
          kind: "receipt",
          voucher_type: 11,
          point_of_sale: 7,
          authorization_kind: "cae",
          count: 1,
          amount: 6_000,
        },
        {
          kind: "receipt",
          voucher_type: 11,
          point_of_sale: 8,
          authorization_kind: "caea",
          count: 1,
          amount: 2_000,
        },
        {
          kind: "credit_note",
          voucher_type: 13,
          point_of_sale: 7,
          authorization_kind: "cae",
          count: 1,
          amount: -1_500,
        },
      ],
      totals: {
        receipts: { count: 2, amount: 8_000 },
        credit_notes: { count: 1, amount: -1_500 },
        amount: 6_500,
        contingency: { count: 1, share_tenths_of_percent: 333 },
      },
    });
  });

  it("counts only the register asked for", async () => {
    const { headers, locationId } = await signedInWith(db, ["view_reports"], NOW);
    const first = await insertRegisterOf(db, locationId, "Caja 1");
    const second = await insertRegisterOf(db, locationId, "Caja 2");
    await insertReceiptRequest(db, first, { total: 100 });
    await insertReceiptRequest(db, second, { total: 8_000 });

    const response = await report(headers, `${range}&register_id=${first}`);

    expect(response.json()).toMatchObject({ totals: { receipts: { count: 1, amount: 100 } } });
  });
});
