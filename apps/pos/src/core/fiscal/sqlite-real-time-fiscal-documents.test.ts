import type {
  RealTimeAuthorizationResolved,
  UnclearDocumentSettled,
} from "@purosur/domain/fiscal/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";
import { SqliteRealTimeFiscalDocuments } from "./sqlite-real-time-fiscal-documents";
import {
  FACTURA_C,
  insertCompletedSale,
  insertDeferredSale,
  insertFiscalDocument,
  insertSaleCompletedEvent,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";

const RESOLVED_AT = new Date("2026-09-30T12:05:03.000Z");

let database: LocalDatabase;
let documents: SqliteRealTimeFiscalDocuments;

function resolution(
  resolved: Pick<RealTimeAuthorizationResolved, "resolution">,
  fiscalDocumentId = "doc-1",
): RealTimeAuthorizationResolved {
  return { fiscalDocumentId, saleId: "sale-1", resolvedAt: RESOLVED_AT, ...resolved };
}

function storedDocument() {
  return database
    .prepare(
      `SELECT state, authorization_code, authorization_code_due_on, resolved_at
       FROM fiscal_documents WHERE id = 'doc-1'`,
    )
    .get();
}

function routings() {
  return database.prepare("SELECT sale_id, reason, routed_at FROM deferred_sales").all();
}

beforeEach(() => {
  database = openFiscalDatabase();
  insertCompletedSale(database, "sale-1");
  insertSaleCompletedEvent(database, "sale-1");
  insertFiscalDocument(database);
  documents = new SqliteRealTimeFiscalDocuments(database);
});

afterEach(() => {
  database.close();
});

describe("the document waiting on a real-time answer", () => {
  it("is the reserved document with the event of the sale as it travels to the cloud", async () => {
    const [saleEvent] = await new SqliteLocalOutbox(database, () => RESOLVED_AT).unacknowledged(10);

    await expect(documents.waitingDocumentOfSale("sale-1")).resolves.toEqual({
      fiscalDocumentId: "doc-1",
      saleId: "sale-1",
      pointOfSale: POINT_OF_SALE,
      number: 41,
      issuedOn: "2026-09-30",
      document: FACTURA_C,
      saleEvent,
    });
    expect(saleEvent).toMatchObject({ event_type: "sale_completed", aggregate_id: "sale-1" });
  });

  it("carries the event of its own sale among the events of others", async () => {
    insertCompletedSale(database, "sale-2");
    insertSaleCompletedEvent(database, "sale-2");

    const waiting = await documents.waitingDocumentOfSale("sale-1");

    expect(waiting?.saleEvent?.aggregate_id).toBe("sale-1");
  });

  it("still carries the event once the regular push acknowledged it", async () => {
    database.prepare("UPDATE outbox SET acked_at = '2026-09-30T12:05:01.000Z'").run();

    const waiting = await documents.waitingDocumentOfSale("sale-1");

    expect(waiting?.saleEvent).toMatchObject({ event_type: "sale_completed" });
  });

  it("carries no event when the outbox no longer holds the sale's", async () => {
    database.prepare("DELETE FROM outbox").run();

    const waiting = await documents.waitingDocumentOfSale("sale-1");

    expect(waiting).toMatchObject({ fiscalDocumentId: "doc-1", saleEvent: null });
  });

  it.each(["UNKNOWN", "AUTHORIZED", "REJECTED"] as const)(
    "is none once the document is %s",
    async (state) => {
      database.prepare("DELETE FROM fiscal_documents").run();
      insertFiscalDocument(database, { state });

      await expect(documents.waitingDocumentOfSale("sale-1")).resolves.toBeNull();
    },
  );

  it("is none for a sale the register reserved no document for", async () => {
    insertCompletedSale(database, "sale-2");

    await expect(documents.waitingDocumentOfSale("sale-2")).resolves.toBeNull();
  });
});

describe("the documents still requesting their answer", () => {
  it("are every document waiting on a real-time answer, of whatever sale, and no settled one", async () => {
    insertCompletedSale(database, "sale-2");
    insertFiscalDocument(database, { id: "doc-2", saleId: "sale-2", pointOfSale: 13 });
    insertCompletedSale(database, "sale-3");
    insertFiscalDocument(database, {
      id: "doc-3",
      saleId: "sale-3",
      pointOfSale: 14,
      state: "UNKNOWN",
    });

    expect(documents.transaction((tx) => tx.requestingDocuments())).toEqual([
      { fiscalDocumentId: "doc-1", saleId: "sale-1" },
      { fiscalDocumentId: "doc-2", saleId: "sale-2" },
    ]);
  });

  it("are none once every document was answered", async () => {
    database.prepare("DELETE FROM fiscal_documents").run();
    insertFiscalDocument(database, { state: "AUTHORIZED" });

    expect(documents.transaction((tx) => tx.requestingDocuments())).toEqual([]);
  });
});

describe("resolving a waiting document", () => {
  it("authorizes it with its code and expiry, consuming the number, and routes nothing", async () => {
    await documents.resolve(
      resolution({
        resolution: {
          state: "AUTHORIZED",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-10",
        },
      }),
    );

    expect(storedDocument()).toEqual({
      state: "AUTHORIZED",
      authorization_code: "75123456789012",
      authorization_code_due_on: "2026-10-10",
      resolved_at: RESOLVED_AT.toISOString(),
    });
    expect(routings()).toEqual([]);
  });

  it("rejects it, releases the number for the next document and routes the sale to the deferred flow", async () => {
    await documents.resolve(
      resolution({ resolution: { state: "REJECTED", deferralReason: "rejected" } }),
    );

    expect(storedDocument()).toMatchObject({
      state: "REJECTED",
      authorization_code: null,
      resolved_at: RESOLVED_AT.toISOString(),
    });
    expect(routings()).toEqual([
      { sale_id: "sale-1", reason: "rejected", routed_at: RESOLVED_AT.toISOString() },
    ]);
    insertCompletedSale(database, "sale-2");
    insertFiscalDocument(database, { id: "doc-2", saleId: "sale-2", number: 41 });
  });

  it("leaves it unclear, keeping the number and the point of sale blocked, and routes the sale", async () => {
    await documents.resolve(
      resolution({ resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" } }),
    );

    expect(storedDocument()).toMatchObject({ state: "UNKNOWN", authorization_code: null });
    expect(routings()).toEqual([
      { sale_id: "sale-1", reason: "unclear_outcome", routed_at: RESOLVED_AT.toISOString() },
    ]);
    insertCompletedSale(database, "sale-2");
    expect(() =>
      insertFiscalDocument(database, { id: "doc-2", saleId: "sale-2", number: 42 }),
    ).toThrow(/UNIQUE/);
  });

  it("changes nothing when routing the sale fails", async () => {
    database
      .prepare(
        "INSERT INTO deferred_sales (sale_id, reason, routed_at) VALUES ('sale-1', 'rejected', '2026-09-30T12:05:00.000Z')",
      )
      .run();

    await expect(
      documents.resolve(
        resolution({ resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" } }),
      ),
    ).rejects.toThrow(/UNIQUE/);

    expect(storedDocument()).toMatchObject({ state: "REQUESTING", resolved_at: null });
  });

  it("refuses to resolve a document that is no longer waiting, leaving it as it is", async () => {
    await documents.resolve(
      resolution({ resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" } }),
    );

    await expect(
      documents.resolve(
        resolution({
          resolution: {
            state: "AUTHORIZED",
            authorizationCode: "75123456789012",
            authorizationCodeDueOn: "2026-10-10",
          },
        }),
      ),
    ).rejects.toThrow("the fiscal document is not waiting for an answer");
    expect(storedDocument()).toMatchObject({ state: "UNKNOWN" });
  });
});

describe("the documents left with an unclear outcome", () => {
  beforeEach(() => {
    database.prepare("DELETE FROM fiscal_documents").run();
  });

  it("are every unknown document, oldest first, with what the cloud is asked and the event of its sale", async () => {
    insertCompletedSale(database, "sale-2");
    insertSaleCompletedEvent(database, "sale-2");
    insertFiscalDocument(database, {
      id: "doc-2",
      saleId: "sale-2",
      pointOfSale: 13,
      number: 7,
      state: "UNKNOWN",
    });
    insertFiscalDocument(database, { id: "doc-1", state: "UNKNOWN" });
    database
      .prepare(
        "UPDATE fiscal_documents SET reserved_at = '2026-09-30T12:00:00.000Z' WHERE id = 'doc-2'",
      )
      .run();

    const unclear = await documents.unclearDocuments();

    expect(
      unclear.map(({ fiscalDocumentId, saleId, pointOfSale, number, issuedOn, document }) => ({
        fiscalDocumentId,
        saleId,
        pointOfSale,
        number,
        issuedOn,
        document,
      })),
    ).toEqual([
      {
        fiscalDocumentId: "doc-2",
        saleId: "sale-2",
        pointOfSale: 13,
        number: 7,
        issuedOn: "2026-09-30",
        document: FACTURA_C,
      },
      {
        fiscalDocumentId: "doc-1",
        saleId: "sale-1",
        pointOfSale: POINT_OF_SALE,
        number: 41,
        issuedOn: "2026-09-30",
        document: FACTURA_C,
      },
    ]);
    expect(unclear.map(({ saleEvent }) => saleEvent?.aggregate_id)).toEqual(["sale-2", "sale-1"]);
  });

  it("carry no event when the outbox no longer holds the sale's", async () => {
    insertFiscalDocument(database, { state: "UNKNOWN" });
    database.prepare("DELETE FROM outbox").run();

    await expect(documents.unclearDocuments()).resolves.toMatchObject([
      { fiscalDocumentId: "doc-1", saleEvent: null },
    ]);
  });

  it.each(["REQUESTING", "AUTHORIZED", "REJECTED", "RELEASED", "CONFLICTING"] as const)(
    "are none while the only document is %s",
    async (state) => {
      insertFiscalDocument(database, { state });

      await expect(documents.unclearDocuments()).resolves.toEqual([]);
    },
  );
});

describe("settling an unclear document", () => {
  function settled(settlement: UnclearDocumentSettled["settlement"]): UnclearDocumentSettled {
    return { fiscalDocumentId: "doc-1", saleId: "sale-1", settlement, settledAt: RESOLVED_AT };
  }

  function deferredRecord() {
    return database
      .prepare(
        `SELECT reason, satisfied_by_fiscal_document_id, satisfied_at FROM deferred_sales WHERE sale_id = 'sale-1'`,
      )
      .get();
  }

  beforeEach(() => {
    database.prepare("DELETE FROM fiscal_documents").run();
    insertFiscalDocument(database, { state: "UNKNOWN" });
    insertDeferredSale(database, "sale-1");
  });

  it("releases it, freeing its number and leaving the sale deferred", async () => {
    await documents.settle(settled({ state: "RELEASED" }));

    expect(storedDocument()).toMatchObject({
      state: "RELEASED",
      authorization_code: null,
      resolved_at: RESOLVED_AT.toISOString(),
    });
    expect(deferredRecord()).toEqual({
      reason: "unclear_outcome",
      satisfied_by_fiscal_document_id: null,
      satisfied_at: null,
    });
  });

  it("marks it conflicting, keeping its number and leaving the sale deferred", async () => {
    await documents.settle(settled({ state: "CONFLICTING" }));

    expect(storedDocument()).toMatchObject({
      state: "CONFLICTING",
      resolved_at: RESOLVED_AT.toISOString(),
    });
    expect(deferredRecord()).toMatchObject({ satisfied_at: null });
  });

  it("authorizes it with its code and due date and satisfies the deferred record of its sale", async () => {
    await documents.settle(
      settled({
        state: "AUTHORIZED",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-10",
      }),
    );

    expect(storedDocument()).toEqual({
      state: "AUTHORIZED",
      authorization_code: "75123456789012",
      authorization_code_due_on: "2026-10-10",
      resolved_at: RESOLVED_AT.toISOString(),
    });
    expect(deferredRecord()).toEqual({
      reason: "unclear_outcome",
      satisfied_by_fiscal_document_id: "doc-1",
      satisfied_at: RESOLVED_AT.toISOString(),
    });
  });

  it("rejects it and gives the deferred record of its sale the reason rejected", async () => {
    await documents.settle(settled({ state: "REJECTED", deferralReason: "rejected" }));

    expect(storedDocument()).toMatchObject({ state: "REJECTED", authorization_code: null });
    expect(deferredRecord()).toEqual({
      reason: "rejected",
      satisfied_by_fiscal_document_id: null,
      satisfied_at: null,
    });
  });

  it("refuses a document that is no longer unclear, leaving it and its sale as they are", async () => {
    database.prepare("UPDATE fiscal_documents SET state = 'RELEASED'").run();

    await expect(documents.settle(settled({ state: "CONFLICTING" }))).rejects.toThrow(
      "the fiscal document is not unclear",
    );

    expect(storedDocument()).toMatchObject({ state: "RELEASED" });
    expect(deferredRecord()).toMatchObject({ reason: "unclear_outcome", satisfied_at: null });
  });

  it("changes nothing when the sale has no deferred record to update", async () => {
    database.prepare("DELETE FROM deferred_sales").run();

    await expect(
      documents.settle(
        settled({
          state: "AUTHORIZED",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-10",
        }),
      ),
    ).rejects.toThrow("the sale has no deferred record");

    expect(storedDocument()).toMatchObject({ state: "UNKNOWN" });
  });
});
