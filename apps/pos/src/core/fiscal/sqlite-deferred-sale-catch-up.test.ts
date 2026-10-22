import { type DeferredSaleSatisfied, deferredSaleSatisfiedEvent } from "@purosur/domain";
import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import {
  catchUpDeferredSales,
  type RealTimeAuthorizationCall,
  type RealTimeTaxAuthority,
} from "@purosur/domain/fiscal/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { CHAIN_KEY } from "../sync/test-support/sqlite-local-outbox";
import { SqliteDeferredSaleCatchUp } from "./sqlite-deferred-sale-catch-up";
import { SqliteRealTimeFiscalDocuments } from "./sqlite-real-time-fiscal-documents";
import { SqliteRoundTripSamples } from "./sqlite-round-trip-samples";
import {
  FACTURA_C,
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

const NOW = new Date("2026-10-12T15:00:00.000Z");
const FIRST_SALE_AT = new Date("2026-10-08T14:00:00.000Z");
const SECOND_SALE_AT = new Date("2026-10-09T02:30:00.000Z");

let database: LocalDatabase;
let catchUp: SqliteDeferredSaleCatchUp;

function addPendingSale(saleId: string, occurredAt: Date): void {
  insertCompletedSale(database, saleId);
  insertSaleCompletedEvent(database, saleId);
  insertDeferredSale(database, saleId, "fiscally_offline", { occurredAt });
}

function satisfaction(): DeferredSaleSatisfied {
  return {
    eventId: "event-satisfied-1",
    registerId: "register-1",
    actorId: "u1",
    deferredSaleId: "deferred-of-sale-1",
    saleId: "sale-1",
    fiscalDocumentId: "doc-1",
    pointOfSale: POINT_OF_SALE,
    number: 41,
    issuedOn: "2026-10-08",
    satisfiedAt: NOW,
  };
}

function deferredRecords() {
  return database
    .prepare(
      "SELECT sale_id, satisfied_by_fiscal_document_id, satisfied_at FROM deferred_sales ORDER BY sale_id",
    )
    .all();
}

function outboxEventTypes() {
  return database
    .prepare(
      "SELECT event_type, aggregate_id FROM outbox WHERE event_type = 'deferred_sale_satisfied'",
    )
    .all();
}

beforeEach(() => {
  database = openFiscalDatabase();
  catchUp = new SqliteDeferredSaleCatchUp(database, CHAIN_KEY);
});

afterEach(() => {
  database.close();
});

describe("what the deferred-sale catch-up reads", () => {
  it("is the real-time series with the backlog of the pending deferred sales", () => {
    insertPointOfSale(database, 100);
    addPendingSale("sale-1", FIRST_SALE_AT);

    const series = catchUp.transaction((tx) => tx.realTimeSeries());

    expect(series).toMatchObject({
      pointOfSale: POINT_OF_SALE,
      taxAuthorityLastAuthorized: 100,
      deferredBacklog: [{ saleId: "sale-1", occurredAt: FIRST_SALE_AT, total: FACTURA_C.total }],
    });
  });

  it("is the fiscal online evidence of the latest health check", () => {
    insertHealthCheck(database, { checkedAt: "2026-10-12T14:59:58.000Z", tokenValid: false });

    expect(catchUp.transaction((tx) => tx.fiscalOnlineEvidence())).toEqual({
      lastHealthCheckOkAt: new Date("2026-10-12T14:59:58.000Z"),
      tokenValid: false,
      arcaReachable: true,
    });
  });

  it("is the issuer identification and the buyer tax statuses in effect", () => {
    insertIssuerIdentification(database);
    insertBuyerTaxStatusSet(database);

    const [issuer, buyerTaxStatuses] = catchUp.transaction((tx) => [
      tx.issuerIdentification(),
      tx.buyerTaxStatuses(),
    ]);

    expect(issuer).toMatchObject({ authorizedCuit: FICTIONAL_CUIT, version: 3 });
    expect(buyerTaxStatuses).toEqual([
      { code: 5, description: "Consumidor Final", invoiceClass: "C" },
    ]);
  });

  it("is that the register still awaits its restored numbering", () => {
    insertPointOfSale(database, 100);
    expect(catchUp.transaction((tx) => tx.awaitsRestoredNumbering())).toBe(false);

    database
      .prepare("INSERT INTO awaiting_restored_numbering (register_id) VALUES ('register-1')")
      .run();

    expect(catchUp.transaction((tx) => tx.awaitsRestoredNumbering())).toBe(true);
  });

  it("is not awaiting restored numbering without a point of sale, whatever the register is waiting for", () => {
    database
      .prepare("INSERT INTO awaiting_restored_numbering (register_id) VALUES ('register-1')")
      .run();

    expect(catchUp.transaction((tx) => tx.awaitsRestoredNumbering())).toBe(false);
  });
});

describe("the deferred sales holding an authorized document", () => {
  beforeEach(() => {
    addPendingSale("sale-1", FIRST_SALE_AT);
    insertFiscalDocument(database, { state: "AUTHORIZED", issuedOn: "2026-10-08" });
  });

  it("are the pending records whose sale holds one, with the document and who made the sale", () => {
    expect(catchUp.transaction((tx) => tx.deferredSalesHoldingAuthorizedDocument())).toEqual([
      {
        deferredSaleId: "deferred-of-sale-1",
        saleId: "sale-1",
        origin: { registerId: "register-1", actorId: "u1" },
        fiscalDocumentId: "doc-1",
        pointOfSale: POINT_OF_SALE,
        number: 41,
        issuedOn: "2026-10-08",
      },
    ]);
  });

  it("leave out a record already satisfied", () => {
    database
      .prepare(
        "UPDATE deferred_sales SET satisfied_at = ?, satisfied_by_fiscal_document_id = 'doc-1'",
      )
      .run(NOW.toISOString());

    expect(catchUp.transaction((tx) => tx.deferredSalesHoldingAuthorizedDocument())).toEqual([]);
  });

  it("leave out a record cancelled", () => {
    database.prepare("UPDATE deferred_sales SET cancelled_at = ?").run(NOW.toISOString());

    expect(catchUp.transaction((tx) => tx.deferredSalesHoldingAuthorizedDocument())).toEqual([]);
  });

  it("leave out a sale whose document is not authorized", () => {
    database.prepare("DELETE FROM fiscal_documents").run();
    insertFiscalDocument(database, { state: "REJECTED" });

    expect(catchUp.transaction((tx) => tx.deferredSalesHoldingAuthorizedDocument())).toEqual([]);
  });
});

describe("satisfying a deferred sale", () => {
  beforeEach(() => {
    addPendingSale("sale-1", FIRST_SALE_AT);
    insertFiscalDocument(database, { state: "AUTHORIZED" });
  });

  it("marks the record satisfied by the document and appends the event that reports it", () => {
    catchUp.transaction((tx) =>
      tx.satisfyDeferredSale({
        saleId: "sale-1",
        fiscalDocumentId: "doc-1",
        satisfiedAt: NOW,
        event: deferredSaleSatisfiedEvent(satisfaction()),
      }),
    );

    expect(deferredRecords()).toEqual([
      {
        sale_id: "sale-1",
        satisfied_by_fiscal_document_id: "doc-1",
        satisfied_at: NOW.toISOString(),
      },
    ]);
    expect(outboxEventTypes()).toEqual([
      { event_type: "deferred_sale_satisfied", aggregate_id: "sale-1" },
    ]);
  });

  it("changes nothing when the sale has no record", () => {
    database.prepare("DELETE FROM deferred_sales").run();

    expect(() =>
      catchUp.transaction((tx) =>
        tx.satisfyDeferredSale({
          saleId: "sale-1",
          fiscalDocumentId: "doc-1",
          satisfiedAt: NOW,
          event: deferredSaleSatisfiedEvent(satisfaction()),
        }),
      ),
    ).toThrow("the sale has no deferred record");
    expect(outboxEventTypes()).toEqual([]);
  });

  it("refuses to report without the outbox chain key, leaving the record pending", () => {
    const keyless = new SqliteDeferredSaleCatchUp(database, undefined);

    expect(() =>
      keyless.transaction((tx) =>
        tx.satisfyDeferredSale({
          saleId: "sale-1",
          fiscalDocumentId: "doc-1",
          satisfiedAt: NOW,
          event: deferredSaleSatisfiedEvent(satisfaction()),
        }),
      ),
    ).toThrow("the register has no outbox chain key");
    expect(deferredRecords()).toEqual([
      { sale_id: "sale-1", satisfied_by_fiscal_document_id: null, satisfied_at: null },
    ]);
  });
});

describe("reserving a document", () => {
  const reservation = {
    id: "doc-9",
    saleId: "sale-1",
    pointOfSale: POINT_OF_SALE,
    number: 101,
    issuedOn: "2026-10-08",
    document: FACTURA_C,
    reservedAt: NOW,
  };

  beforeEach(() => {
    addPendingSale("sale-1", FIRST_SALE_AT);
  });

  it("stores it waiting for the tax authority's answer, dated with the sale's own day", () => {
    catchUp.transaction((tx) => tx.reserveFiscalDocument(reservation));

    expect(
      database
        .prepare(
          "SELECT id, sale_id, number, issued_on, state, reserved_at, document FROM fiscal_documents",
        )
        .all(),
    ).toEqual([
      {
        id: "doc-9",
        sale_id: "sale-1",
        number: 101,
        issued_on: "2026-10-08",
        state: "REQUESTING",
        reserved_at: NOW.toISOString(),
        document: JSON.stringify(FACTURA_C),
      },
    ]);
  });

  it("is allowed for a sale whose earlier document was rejected", () => {
    insertFiscalDocument(database, { state: "REJECTED" });

    catchUp.transaction((tx) => tx.reserveFiscalDocument(reservation));

    expect(database.prepare("SELECT id, state FROM fiscal_documents ORDER BY id").all()).toEqual([
      { id: "doc-1", state: "REJECTED" },
      { id: "doc-9", state: "REQUESTING" },
    ]);
  });

  it("raises the clock mark of the point of sale", () => {
    catchUp.transaction((tx) =>
      tx.recordClockMark({ pointOfSale: POINT_OF_SALE, documentType: "factura_c", reading: NOW }),
    );

    expect(
      database
        .prepare("SELECT point_of_sale, document_type, reading FROM register_clock_marks")
        .all(),
    ).toEqual([
      { point_of_sale: POINT_OF_SALE, document_type: "factura_c", reading: NOW.toISOString() },
    ]);
  });
});

describe("catching up against the local database", () => {
  const calls: RealTimeAuthorizationCall[] = [];
  const taxAuthority: RealTimeTaxAuthority = {
    authorize: async (call) => {
      calls.push(call);
      return {
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-22",
      };
    },
  };

  function run() {
    return catchUpDeferredSales({
      catchUp,
      documents: new SqliteRealTimeFiscalDocuments(database, CHAIN_KEY),
      roundTrips: new SqliteRoundTripSamples(database),
      taxAuthority,
      clock: { now: () => NOW },
      ids: { next: () => crypto.randomUUID() },
      shortCodes: scriptedShortCodes(["7KQ4M2P9"]),
    });
  }

  beforeEach(() => {
    calls.length = 0;
    insertPointOfSale(database, 100);
    insertIssuerIdentification(database);
    insertBuyerTaxStatusSet(database);
    insertHealthCheck(database, { checkedAt: "2026-10-12T14:59:58.000Z" });
    addPendingSale("sale-2", SECOND_SALE_AT);
    addPendingSale("sale-1", FIRST_SALE_AT);
  });

  it("invoices the pending sales in date order, each under its own day and the next number", async () => {
    expect(await run()).toEqual({ kind: "completed", invoiced: ["sale-1", "sale-2"] });

    expect(
      database
        .prepare("SELECT sale_id, number, issued_on, state FROM fiscal_documents ORDER BY number")
        .all(),
    ).toEqual([
      { sale_id: "sale-1", number: 101, issued_on: "2026-10-08", state: "AUTHORIZED" },
      { sale_id: "sale-2", number: 102, issued_on: "2026-10-08", state: "AUTHORIZED" },
    ]);
    expect(calls.map(({ saleId }) => saleId)).toEqual(["sale-1", "sale-2"]);
  });

  it("satisfies each record and reports each satisfaction", async () => {
    await run();

    expect(
      deferredRecords().map((row) => (row as { satisfied_at: string | null }).satisfied_at),
    ).toEqual([NOW.toISOString(), NOW.toISOString()]);
    expect(outboxEventTypes()).toHaveLength(2);
  });

  it("invoices nothing the second time it runs", async () => {
    await run();
    calls.length = 0;

    expect(await run()).toEqual({ kind: "completed", invoiced: [] });
    expect(calls).toEqual([]);
  });

  it("satisfies, without invoicing again, a record whose sale already holds an authorized document", async () => {
    insertFiscalDocument(database, { state: "AUTHORIZED", number: 90, issuedOn: "2026-10-08" });

    await run();

    expect(calls.map(({ saleId }) => saleId)).toEqual(["sale-2"]);
    expect(
      database
        .prepare(
          "SELECT satisfied_by_fiscal_document_id FROM deferred_sales WHERE sale_id = 'sale-1'",
        )
        .get(),
    ).toEqual({ satisfied_by_fiscal_document_id: "doc-1" });
  });

  it("stops while a restored register awaits its numbering", async () => {
    database
      .prepare("INSERT INTO awaiting_restored_numbering (register_id) VALUES ('register-1')")
      .run();

    expect(await run()).toEqual({
      kind: "stopped",
      invoiced: [],
      reason: { kind: "awaiting_restored_numbering" },
    });
    expect(database.prepare("SELECT id FROM fiscal_documents").all()).toEqual([]);
  });
});
