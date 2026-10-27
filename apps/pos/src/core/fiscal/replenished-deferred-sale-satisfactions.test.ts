import { FICTIONAL_ISSUER } from "@purosur/domain/fiscal/test-support";
import {
  catchUpDeferredSales,
  type RealTimeAuthorizationCall,
} from "@purosur/domain/fiscal/use-cases";
import { aDeferredSaleSatisfiedFact } from "@purosur/domain/sync/test-support";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { fixedZoneRulesSource } from "../platform/test-support/fixed-zone-rules-source.js";
import { CHAIN_KEY } from "../sync/test-support/sqlite-local-outbox";
import { applyReplenishedDeferredSaleSatisfaction } from "./replenished-deferred-sale-satisfactions";
import { SqliteDeferredSaleCatchUp } from "./sqlite-deferred-sale-catch-up";
import { readRealTimeSeries } from "./sqlite-fiscal-series";
import { SqliteRealTimeFiscalDocuments } from "./sqlite-real-time-fiscal-documents";
import { SqliteRoundTripSamples } from "./sqlite-round-trip-samples";
import {
  insertBuyerTaxStatusSet,
  insertCompletedSale,
  insertDeferredSale,
  insertFiscalDocument,
  insertHealthCheck,
  insertIssuerIdentification,
  insertPointOfSale,
  insertSaleCompletedEvent,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";
import { scriptedShortCodes } from "./test-support/scripted-short-codes";

type SatisfactionFact = Extract<SyncedFact, { kind: "deferred_sale_satisfied" }>;

const BASE = aDeferredSaleSatisfiedFact(FICTIONAL_ISSUER) as SatisfactionFact;
const SATISFIED: SatisfactionFact = {
  ...BASE,
  satisfaction: { ...BASE.satisfaction, pointOfSale: POINT_OF_SALE },
};
const SALE_AT = new Date("2026-10-07T10:00:00.000Z");

let database: LocalDatabase;

function documents() {
  return database
    .prepare(
      `SELECT id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
              authorization_code, authorization_code_due_on, reserved_at, resolved_at
       FROM fiscal_documents ORDER BY number`,
    )
    .all();
}

function record() {
  return database
    .prepare(
      "SELECT satisfied_by_fiscal_document_id, satisfied_at FROM deferred_sales WHERE sale_id = 'sale-1'",
    )
    .get();
}

function clockMarks() {
  return database
    .prepare("SELECT point_of_sale, document_type, reading FROM register_clock_marks")
    .all();
}

beforeEach(() => {
  database = openFiscalDatabase();
  insertCompletedSale(database, "sale-1");
  insertSaleCompletedEvent(database, "sale-1");
  insertDeferredSale(database, "sale-1", "fiscally_offline", { occurredAt: SALE_AT });
});

afterEach(() => {
  database.close();
});

describe("replenishing a deferred sale satisfied by an authorized invoice", () => {
  it("holds the authorized document the sale was invoiced with and marks its record satisfied by it", () => {
    expect(applyReplenishedDeferredSaleSatisfaction(database, SATISFIED)).toBe("applied");

    expect(documents()).toEqual([
      {
        id: "document-1",
        sale_id: "sale-1",
        point_of_sale: POINT_OF_SALE,
        document_type: "factura_c",
        number: 42,
        issued_on: "2026-10-07",
        document: JSON.stringify(SATISFIED.satisfaction.document),
        state: "AUTHORIZED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-17",
        reserved_at: "2026-10-09T09:59:58.000Z",
        resolved_at: "2026-10-09T10:00:00.000Z",
      },
    ]);
    expect(record()).toEqual({
      satisfied_by_fiscal_document_id: "document-1",
      satisfied_at: "2026-10-09T10:00:00.000Z",
    });
  });

  it("changes nothing when applied again", () => {
    applyReplenishedDeferredSaleSatisfaction(database, SATISFIED);
    const heldDocuments = documents();
    const heldRecord = record();

    expect(applyReplenishedDeferredSaleSatisfaction(database, SATISFIED)).toBe("applied");

    expect(documents()).toEqual(heldDocuments);
    expect(record()).toEqual(heldRecord);
  });

  it("satisfies the record with the document the register already holds, leaving it as it is", () => {
    insertFiscalDocument(database, {
      id: "document-1",
      state: "AUTHORIZED",
      number: 42,
      issuedOn: "2026-10-07",
    });
    const held = documents();

    expect(applyReplenishedDeferredSaleSatisfaction(database, SATISFIED)).toBe("applied");

    expect(documents()).toEqual(held);
    expect(record()).toEqual({
      satisfied_by_fiscal_document_id: "document-1",
      satisfied_at: "2026-10-09T10:00:00.000Z",
    });
  });

  it("is not yet applicable while the register holds no deferred record of the sale, and writes nothing", () => {
    database.prepare("DELETE FROM deferred_sales").run();

    expect(applyReplenishedDeferredSaleSatisfaction(database, SATISFIED)).toBe(
      "not_yet_applicable",
    );

    expect(documents()).toEqual([]);
    expect(clockMarks()).toEqual([]);
  });

  it("holds the document but leaves a cancelled record cancelled", () => {
    database.prepare("UPDATE deferred_sales SET cancelled_at = '2026-10-08T00:00:00.000Z'").run();

    expect(applyReplenishedDeferredSaleSatisfaction(database, SATISFIED)).toBe("applied");

    expect(documents()).toHaveLength(1);
    expect(record()).toEqual({ satisfied_by_fiscal_document_id: null, satisfied_at: null });
  });

  it("never puts the replenished satisfaction in the outbox", () => {
    const before = database.prepare("SELECT count(*) AS total FROM outbox").get();

    applyReplenishedDeferredSaleSatisfaction(database, SATISFIED);

    expect(database.prepare("SELECT count(*) AS total FROM outbox").get()).toEqual(before);
  });

  describe("once applied", () => {
    const calls: RealTimeAuthorizationCall[] = [];
    const NOW = new Date("2026-10-12T15:00:00.000Z");

    function catchUp() {
      return catchUpDeferredSales({
        zoneRules: fixedZoneRulesSource(),
        catchUp: new SqliteDeferredSaleCatchUp(database, CHAIN_KEY),
        documents: new SqliteRealTimeFiscalDocuments(database, CHAIN_KEY),
        roundTrips: new SqliteRoundTripSamples(database),
        taxAuthority: {
          authorize: async (call) => {
            calls.push(call);
            return {
              kind: "authorized",
              authorizationCode: "75123456789099",
              authorizationCodeDueOn: "2026-10-22",
            };
          },
        },
        clock: { now: () => NOW },
        ids: { next: () => crypto.randomUUID() },
        shortCodes: scriptedShortCodes(["7KQ4M2P9"]),
      });
    }

    beforeEach(() => {
      calls.length = 0;
      insertPointOfSale(database, 40);
      insertIssuerIdentification(database);
      insertBuyerTaxStatusSet(database);
      insertHealthCheck(database, { checkedAt: "2026-10-12T14:59:58.000Z" });
      insertCompletedSale(database, "sale-2");
      insertSaleCompletedEvent(database, "sale-2");
      insertDeferredSale(database, "sale-2", "fiscally_offline", {
        occurredAt: new Date("2026-10-08T14:00:00.000Z"),
      });
      applyReplenishedDeferredSaleSatisfaction(database, SATISFIED);
    });

    it("leaves the satisfied sale out of the backlog", () => {
      expect(readRealTimeSeries(database).deferredBacklog.map(({ saleId }) => saleId)).toEqual([
        "sale-2",
      ]);
    });

    it("never invoices the satisfied sale again", async () => {
      await catchUp();

      expect(calls.map(({ saleId }) => saleId)).toEqual(["sale-2"]);
    });

    it("numbers the next real-time document after the replenished one", async () => {
      await catchUp();

      expect(calls.map(({ number }) => number)).toEqual([43]);
    });
  });
});
