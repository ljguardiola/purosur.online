import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { decideSaleAuthorizationIn } from "./sqlite-sale-authorization";
import {
  FACTURA_C,
  insertCompletedSale,
  insertFiscalDocument,
  insertHealthCheck,
  insertPointOfSale,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";

const DECIDED_AT = new Date("2026-09-30T12:05:00.000Z");
const PASSED = { kind: "passed", document: FACTURA_C } as const;

let database: LocalDatabase;

function decide(
  gate: Parameters<typeof decideSaleAuthorizationIn>[1]["gate"] = PASSED,
  saleId = "sale-1",
) {
  decideSaleAuthorizationIn(database, {
    saleId,
    gate,
    decidedAt: DECIDED_AT,
    ids: { next: () => "doc-new" },
  });
}

function documents() {
  return database
    .prepare(
      `SELECT id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
              authorization_code, authorization_code_due_on, reserved_at, resolved_at
       FROM fiscal_documents ORDER BY number`,
    )
    .all();
}

function routings() {
  return database.prepare("SELECT sale_id, reason, routed_at FROM deferred_sales").all();
}

beforeEach(() => {
  database = openFiscalDatabase();
  insertCompletedSale(database, "sale-1");
});

afterEach(() => {
  database.close();
});

describe("deciding how a completed sale is authorized, in the local database", () => {
  describe("when the register is online and the tax authority's count is known", () => {
    beforeEach(() => {
      insertHealthCheck(database);
      insertPointOfSale(database, 40);
    });

    it("reserves the number after the tax authority's last one, waiting on a response, and routes nothing", () => {
      decide();

      expect(documents()).toEqual([
        {
          id: "doc-new",
          sale_id: "sale-1",
          point_of_sale: POINT_OF_SALE,
          document_type: "FACTURA_C",
          number: 41,
          issued_on: "2026-09-30",
          document: JSON.stringify(FACTURA_C),
          state: "REQUESTING",
          authorization_code: null,
          authorization_code_due_on: null,
          reserved_at: DECIDED_AT.toISOString(),
          resolved_at: null,
        },
      ]);
      expect(routings()).toEqual([]);
    });

    it("follows the register's own last authorized number when it is further along", () => {
      insertCompletedSale(database, "sale-0");
      insertFiscalDocument(database, {
        id: "doc-0",
        saleId: "sale-0",
        number: 45,
        state: "AUTHORIZED",
      });

      decide();

      expect(documents().map((row) => (row as { number: number }).number)).toEqual([45, 46]);
    });

    it("leaves a rejected number out of the register's own count", () => {
      insertCompletedSale(database, "sale-0");
      insertFiscalDocument(database, {
        id: "doc-0",
        saleId: "sale-0",
        number: 50,
        state: "REJECTED",
      });

      decide();

      expect(documents().map((row) => (row as { number: number }).number)).toEqual([41, 50]);
    });

    it.each(["REQUESTING", "UNKNOWN"] as const)(
      "routes the sale to the deferred flow while a document is %s at the point of sale",
      (state) => {
        insertCompletedSale(database, "sale-0");
        insertFiscalDocument(database, { id: "doc-0", saleId: "sale-0", number: 41, state });

        decide();

        expect(documents()).toHaveLength(1);
        expect(routings()).toEqual([
          { sale_id: "sale-1", reason: "document_waiting", routed_at: DECIDED_AT.toISOString() },
        ]);
      },
    );

    it("reserves after a document of another point of sale is waiting", () => {
      insertCompletedSale(database, "sale-0");
      insertFiscalDocument(database, { id: "doc-0", saleId: "sale-0", pointOfSale: 13, number: 7 });

      decide();

      expect(documents()).toHaveLength(2);
      expect(routings()).toEqual([]);
    });

    it("routes the sale with the gate's reason and reserves nothing when the gate failed", () => {
      decide({ kind: "failed", reason: "issuer_identification_missing" });

      expect(documents()).toEqual([]);
      expect(routings()).toEqual([
        {
          sale_id: "sale-1",
          reason: "pre_emission_gate_failed",
          routed_at: DECIDED_AT.toISOString(),
        },
      ]);
    });
  });

  it("routes the sale as fiscally offline when no health check was ever recorded", () => {
    insertPointOfSale(database, 40);

    decide();

    expect(documents()).toEqual([]);
    expect(routings()).toMatchObject([{ sale_id: "sale-1", reason: "fiscally_offline" }]);
  });

  it("goes by the latest health check only", () => {
    insertPointOfSale(database, 40);
    insertHealthCheck(database, { checkedAt: "2026-09-30T12:04:50.000Z" });
    insertHealthCheck(database, { checkedAt: "2026-09-30T12:04:55.000Z", tokenValid: false });

    decide();

    expect(routings()).toMatchObject([{ reason: "fiscally_offline" }]);
  });

  it.each([
    ["is too old", { checkedAt: "2026-09-30T12:04:00.000Z" }],
    ["found the token invalid", { tokenValid: false }],
    ["found the tax authority unreachable", { arcaReachable: false }],
  ])("routes the sale as fiscally offline when the latest health check %s", (_case, check) => {
    insertPointOfSale(database, 40);
    insertHealthCheck(database, check);

    decide();

    expect(documents()).toEqual([]);
    expect(routings()).toMatchObject([{ reason: "fiscally_offline" }]);
  });

  it("routes the sale when the register has no point of sale yet", () => {
    insertHealthCheck(database);

    decide();

    expect(routings()).toMatchObject([{ reason: "point_of_sale_missing" }]);
  });

  it("routes the sale until the tax authority's count reaches the register", () => {
    insertHealthCheck(database);
    insertPointOfSale(database, null);

    decide();

    expect(documents()).toEqual([]);
    expect(routings()).toMatchObject([{ reason: "tax_authority_count_unknown" }]);
  });

  it("reserves nothing for a removed register's point of sale", () => {
    insertHealthCheck(database);
    insertPointOfSale(database, 40);
    database.prepare("UPDATE own_register SET removed = 1").run();

    decide();

    expect(routings()).toMatchObject([{ reason: "point_of_sale_missing" }]);
  });

  it("gives a sale at most one document: deciding it again once its document resolved is refused", () => {
    insertHealthCheck(database);
    insertPointOfSale(database, 40);
    decide();
    database
      .prepare(
        `UPDATE fiscal_documents SET state = 'AUTHORIZED', authorization_code = 'c',
           authorization_code_due_on = '2026-10-10', resolved_at = '2026-09-30T12:05:01.000Z'`,
      )
      .run();

    expect(() => decide()).toThrow(/UNIQUE/);
    expect(documents()).toHaveLength(1);
  });
});
