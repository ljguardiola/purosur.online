import { exceptionShareYearSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { DrizzleExceptionShareBreachStore } from "./drizzle-exception-share-breach-store.js";
import { registerExceptionShareYearRoute } from "./exception-share-year-route.js";
import {
  insertFiscalAddress,
  insertRegisterAtFiscalAddress,
} from "./test-support/exception-share-fixtures.js";
import {
  insertCaeaDocument,
  insertReceiptRequest,
} from "./test-support/issued-document-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const MISSING_ID = "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f";

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
  registerExceptionShareYearRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    zoneRules: fixedZoneRulesSource(),
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function read(headers: Record<string, string>, fiscalAddressId: string, query = "?year=2026") {
  return app.inject({
    method: "GET",
    url: `/fiscal/exception-share/${fiscalAddressId}${query}`,
    headers,
  });
}

describe("GET /fiscal/exception-share/:fiscalAddressId access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await read({ origin: BACKOFFICE_ORIGIN }, MISSING_ID);

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await read({ ...headers, origin: "https://attacker.example" }, MISSING_ID);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view fiscal documents, even for an address that does not exist", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await read(headers, MISSING_ID);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view fiscal documents", async () => {
    const fiscalAddressId = await insertFiscalAddress(db, "Depósito Central");
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await read(headers, fiscalAddressId);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /fiscal/exception-share/:fiscalAddressId requests", () => {
  it.each([
    ["no year", ""],
    ["a year that is not a number", "?year=abcd"],
    ["a year with five digits", "?year=20260"],
  ])("answers 400 to %s", async (_name, query) => {
    const fiscalAddressId = await insertFiscalAddress(db, "Depósito Central");
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await read(headers, fiscalAddressId, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("answers 400 to an id that is not a record id", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await read(headers, "not-an-id");

    expect(response.statusCode).toBe(400);
  });

  it("answers 404 to a fiscal address that does not exist", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await read(headers, MISSING_ID);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });
});

describe("GET /fiscal/exception-share/:fiscalAddressId", () => {
  it("answers the months of the year started so far, the running one in progress and a closed one past the threshold as non-compliant", async () => {
    const fiscalAddressId = await insertFiscalAddress(db, "Depósito Central");
    const registerId = await insertRegisterAtFiscalAddress(db, fiscalAddressId, "Caja 1");
    await insertCaeaDocument(db, registerId, { issuedOn: "2026-09-12" });
    for (let voucher = 0; voucher < 19; voucher += 1) {
      await insertReceiptRequest(db, registerId, { issuedOn: "2026-09-13" });
    }
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-10-02" });
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await read(headers, fiscalAddressId);

    const body = exceptionShareYearSchema.parse(response.json());
    expect(body.fiscal_address).toEqual({ id: fiscalAddressId, name: "Depósito Central" });
    expect(body.year).toBe(2026);
    expect(body.months.map(({ month }) => month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(body.months.find(({ month }) => month === "2026-09")).toEqual({
      month: "2026-09",
      exception_count: 1,
      total_count: 20,
      share_tenths_of_percent: 50,
      state: "non_compliant",
    });
    expect(body.months.find(({ month }) => month === "2026-10")).toEqual({
      month: "2026-10",
      exception_count: 0,
      total_count: 1,
      share_tenths_of_percent: 0,
      state: "in_progress",
    });
    expect(body.months.find(({ month }) => month === "2026-03")).toEqual({
      month: "2026-03",
      exception_count: 0,
      total_count: 0,
      share_tenths_of_percent: null,
      state: "compliant",
    });
    expect(body.non_compliant_months).toEqual(["2026-09"]);
  });

  it("lists a month recorded as non-compliant even when its vouchers no longer reach the threshold", async () => {
    const fiscalAddressId = await insertFiscalAddress(db, "Depósito Central");
    await new DrizzleExceptionShareBreachStore(db, () => NOW).transaction((transaction) =>
      transaction.recordBreach({
        fiscalAddressId,
        month: "2026-02",
        exceptionCount: 1,
        totalCount: 10,
      }),
    );
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await read(headers, fiscalAddressId);

    expect(response.json()).toMatchObject({ non_compliant_months: ["2026-02"] });
  });
});
